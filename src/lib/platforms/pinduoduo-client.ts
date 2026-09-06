import "server-only";

import { createHash } from "node:crypto";

import { PlatformAuthError, PlatformRequestError, toSafePlatformError } from "./errors";

const PINDUODUO_API_ROUTER = "https://gw-api.pinduoduo.com/api/router";
const RECOMMEND_METHOD = "pdd.ddk.goods.recommend.get";
const SEARCH_METHOD = "pdd.ddk.goods.search";

type RequestValue = string | number | boolean;
type RequestParameters = Record<string, RequestValue>;
type PinduoduoRequestOptions = { signal?: AbortSignal };

export type PinduoduoGoods = {
  goodsId: string;
  goodsSign: string | null;
  goodsName: string;
  goodsThumbnailUrl: string | null;
  goodsImageUrl: string | null;
  categoryName: string | null;
  mallName: string;
  merchantType: number | null;
  salesTip: string | null;
  realtimeSalesTip: string | null;
  hasCoupon: boolean;
  couponPrice: number | null;
  couponMinOrderAmount: number | null;
  minNormalPrice: number;
  promotionRate: number | null;
  minGroupPrice?: number;
  extraCouponAmount?: number;
  optName?: string;
  catIds?: number[];
  goodsDescription?: string;
  fetchedAt: Date;
};

/** @deprecated Use PinduoduoGoods. Keeps the legacy shape compatible with existing consumers. */
export type PinduoduoRecommendedGoods = Omit<PinduoduoGoods, "fetchedAt"> & { fetchedAt?: Date };

export type PinduoduoGoodsResponse = {
  total: number;
  /** Number of entries in the provider list before public-field validation. */
  rawCount: number;
  parseDiagnostics: PinduoduoParseDiagnostics;
  goods: PinduoduoGoods[];
};

export type PinduoduoParseDiagnostics = {
  missingGoodsIdCount: number;
  missingNameCount: number;
  missingMallNameCount: number;
  missingNormalPriceCount: number;
  missingGroupPriceCount: number;
  noComparablePriceCount: number;
};

/** @deprecated Use PinduoduoGoodsResponse. Kept for existing client consumers. */
export type PinduoduoRecommendResponse = PinduoduoGoodsResponse;

type PinduoduoClientOptions = {
  clientId: string;
  clientSecret: string;
  pid: string;
  fetcher?: typeof fetch;
  now?: () => Date;
};

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function boundedInteger(value: number, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function nonNegativeInteger(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeUrl(value: unknown): string | null {
  const text = optionalString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Converts Pinduoduo money fields documented in fen into PriceAI yuan values. */
export function fenToYuan(value: unknown): number | null {
  const amount = finiteNumber(value);
  return amount !== null && amount >= 0 ? amount / 100 : null;
}

/** Pinduoduo signs sorted key/value pairs with the client secret on both sides, using uppercase MD5. */
export function signPinduoduoRequest(parameters: RequestParameters, clientSecret: string): string {
  const serialized = Object.keys(parameters)
    .sort()
    .map((key) => `${key}${String(parameters[key])}`)
    .join("");
  return createHash("md5").update(`${clientSecret}${serialized}${clientSecret}`, "utf8").digest("hex").toUpperCase();
}

function parsedCatIds(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const catIds = value.map(finiteNumber).filter((item): item is number => item !== null);
  return catIds.length > 0 ? catIds : undefined;
}

function parseGoods(value: unknown, fetchedAt: Date): PinduoduoGoods | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const goodsId = finiteNumber(item.goods_id) ?? optionalString(item.goods_id);
  const goodsName = optionalString(item.goods_name);
  const mallName = optionalString(item.mall_name);
  const minNormalPrice = fenToYuan(item.min_normal_price);
  if (goodsId === null || !goodsName || !mallName || minNormalPrice === null || minNormalPrice <= 0) return null;

  const minGroupPrice = fenToYuan(item.min_group_price);
  const extraCouponAmount = fenToYuan(item.extra_coupon_amount);
  const optName = optionalString(item.opt_name);
  const catIds = parsedCatIds(item.cat_ids);
  const goodsDescription = optionalString(item.goods_desc);

  return {
    goodsId: String(goodsId),
    goodsSign: optionalString(item.goods_sign),
    goodsName,
    goodsThumbnailUrl: safeUrl(item.goods_thumbnail_url),
    goodsImageUrl: safeUrl(item.goods_image_url),
    categoryName: optionalString(item.category_name),
    mallName,
    merchantType: finiteNumber(item.merchant_type),
    salesTip: optionalString(item.sales_tip),
    realtimeSalesTip: optionalString(item.realtime_sales_tip),
    hasCoupon: item.has_coupon === true || item.has_coupon === 1,
    couponPrice: fenToYuan(item.coupon_price),
    couponMinOrderAmount: fenToYuan(item.coupon_min_order_amount),
    minNormalPrice,
    promotionRate: finiteNumber(item.promotion_rate),
    ...(minGroupPrice !== null ? { minGroupPrice } : {}),
    ...(extraCouponAmount !== null ? { extraCouponAmount } : {}),
    ...(optName ? { optName } : {}),
    ...(catIds ? { catIds } : {}),
    ...(goodsDescription ? { goodsDescription } : {}),
    fetchedAt: new Date(fetchedAt.getTime()),
  };
}

function parseDiagnostics(list: readonly unknown[]): PinduoduoParseDiagnostics {
  const diagnostics: PinduoduoParseDiagnostics = {
    missingGoodsIdCount: 0, missingNameCount: 0, missingMallNameCount: 0,
    missingNormalPriceCount: 0, missingGroupPriceCount: 0, noComparablePriceCount: 0,
  };
  for (const value of list) {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const goodsId = finiteNumber(item.goods_id) ?? optionalString(item.goods_id);
    const normalPrice = fenToYuan(item.min_normal_price);
    const groupPrice = fenToYuan(item.min_group_price);
    if (goodsId === null) diagnostics.missingGoodsIdCount += 1;
    if (!optionalString(item.goods_name)) diagnostics.missingNameCount += 1;
    if (!optionalString(item.mall_name)) diagnostics.missingMallNameCount += 1;
    if (normalPrice === null || normalPrice <= 0) diagnostics.missingNormalPriceCount += 1;
    if (groupPrice === null || groupPrice <= 0) diagnostics.missingGroupPriceCount += 1;
    if ((normalPrice === null || normalPrice <= 0) && (groupPrice === null || groupPrice <= 0)) diagnostics.noComparablePriceCount += 1;
  }
  return diagnostics;
}

function parsePinduoduoGoodsResponse(
  value: unknown,
  responseKey: string,
  listKey: string,
  totalKey: string,
  fetchedAt: Date,
): PinduoduoGoodsResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformRequestError("pdd");
  const root = value as Record<string, unknown>;
  if (root.error_response && typeof root.error_response === "object" && !Array.isArray(root.error_response)) {
    const providerCode = finiteNumber((root.error_response as Record<string, unknown>).error_code)
      ?? optionalString((root.error_response as Record<string, unknown>).error_code);
    throw new PlatformRequestError("pdd", null, providerCode);
  }
  const response = root[responseKey];
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new PlatformRequestError("pdd");
  const payload = response as Record<string, unknown>;
  const list = Array.isArray(payload[listKey]) ? payload[listKey] : [];
  return {
    total: Math.max(0, Math.floor(finiteNumber(payload[totalKey]) ?? list.length)),
    rawCount: list.length,
    parseDiagnostics: parseDiagnostics(list),
    goods: list.map((item) => parseGoods(item, fetchedAt)).filter((item): item is PinduoduoGoods => item !== null),
  };
}

export function parsePinduoduoRecommendResponse(value: unknown, fetchedAt = new Date()): PinduoduoRecommendResponse {
  return parsePinduoduoGoodsResponse(value, "goods_basic_detail_response", "list", "total", fetchedAt);
}

export function parsePinduoduoSearchResponse(value: unknown, fetchedAt = new Date()): PinduoduoGoodsResponse {
  return parsePinduoduoGoodsResponse(value, "goods_search_response", "goods_list", "total_count", fetchedAt);
}

export class PinduoduoClient {
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: PinduoduoClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private async request(parameters: RequestParameters, requestOptions: PinduoduoRequestOptions = {}): Promise<unknown> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...parameters, sign: signPinduoduoRequest(parameters, this.options.clientSecret) })) {
      body.set(key, String(value));
    }

    try {
      const response = await this.fetcher(PINDUODUO_API_ROUTER, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: body.toString(),
        cache: "no-store",
        signal: requestOptions.signal,
      });
      if (!response.ok) throw Object.assign(new Error("Pinduoduo request failed"), { status: response.status });
      return await response.json();
    } catch (error) {
      throw toSafePlatformError("pdd", error);
    }
  }

  async getRecommendedGoods(
    { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
    requestOptions: PinduoduoRequestOptions = {},
  ): Promise<PinduoduoRecommendResponse> {
    const fetchedAt = this.now();
    const parameters: RequestParameters = {
      type: RECOMMEND_METHOD,
      client_id: this.options.clientId,
      timestamp: Math.floor(fetchedAt.getTime() / 1000),
      data_type: "JSON",
      version: "V1",
      pid: this.options.pid,
      limit: boundedInteger(limit, 20, 1, 400),
      offset: nonNegativeInteger(offset),
    };
    return parsePinduoduoRecommendResponse(await this.request(parameters, requestOptions), fetchedAt);
  }

  async searchGoods(
    query: string,
    { limit = 20, page = 1 }: { limit?: number; page?: number } = {},
    requestOptions: PinduoduoRequestOptions = {},
  ): Promise<PinduoduoGoodsResponse> {
    const fetchedAt = this.now();
    const parameters: RequestParameters = {
      type: SEARCH_METHOD,
      client_id: this.options.clientId,
      timestamp: Math.floor(fetchedAt.getTime() / 1000),
      data_type: "JSON",
      version: "V1",
      pid: this.options.pid,
      keyword: query,
      page: boundedInteger(page, 1, 1, Number.MAX_SAFE_INTEGER),
      page_size: boundedInteger(limit, 20, 1, 100),
    };
    return parsePinduoduoSearchResponse(await this.request(parameters, requestOptions), fetchedAt);
  }
}

export function createPinduoduoClientFromEnv(): PinduoduoClient | null {
  const clientId = process.env.PDD_CLIENT_ID?.trim();
  const clientSecret = process.env.PDD_CLIENT_SECRET?.trim();
  const pid = process.env.PDD_PID?.trim();
  if (!clientId || !clientSecret || !pid) return null;
  return new PinduoduoClient({ clientId, clientSecret, pid });
}

export function missingPinduoduoConfiguration(): PlatformAuthError {
  return new PlatformAuthError("pdd");
}
