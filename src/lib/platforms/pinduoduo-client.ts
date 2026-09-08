import "server-only";

import { createHash } from "node:crypto";

import { PlatformAuthError, PlatformRequestError, toSafePlatformError } from "./errors";

const PINDUODUO_API_ROUTER = "https://gw-api.pinduoduo.com/api/router";
const RECOMMEND_METHOD = "pdd.ddk.goods.recommend.get";
const SEARCH_METHOD = "pdd.ddk.goods.search";
const GOODS_OPT_METHOD = "pdd.goods.opt.get";
const GOODS_CATEGORY_METHOD = "pdd.goods.cats.get";
const GOODS_DETAIL_METHOD = "pdd.ddk.goods.detail";

type RequestValue = string | number | boolean;
type RequestParameters = Record<string, RequestValue>;
type PinduoduoRequestOptions = { signal?: AbortSignal };
type PinduoduoSearchOptions = {
  limit?: number;
  page?: number;
  optId?: number;
  catId?: number;
  useCustomized?: boolean;
  listId?: string;
};

export type PinduoduoCategoryNode = { id: number; name: string; parentId: number; level: number };

export type PinduoduoGoods = {
  goodsId: string;
  goodsSign: string | null;
  /** Provider search-chain identifier; server memory only and removed before caching. */
  searchId?: string;
  goodsName: string;
  goodsThumbnailUrl: string | null;
  goodsImageUrl: string | null;
  categoryName: string | null;
  mallName: string | null;
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
  /** Search-chain identifier; server memory only and never part of public goods. */
  searchId?: string;
};

export type PinduoduoSkuCapabilitySummary = {
  success: true;
  skuPermissionStatus: "available" | "not_returned";
  skuCount: number;
  skuWithAttributeNameCount: number;
  skuWithAttributeValueCount: number;
  skuWithPriceCount: number;
  hasCapacity: boolean;
  hasColor: boolean;
  hasRegionOrVersion: boolean;
  hasCondition: boolean;
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

function sanitizedProviderMessage(value: unknown): string | null {
  const text = optionalString(value);
  if (!text) return null;
  return text
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/\b(?:pid|sign|token|secret)\s*[=:]\s*[^\s，,；;]+/gi, (entry) => `${entry.split(/[=:]/, 1)[0]}=[REDACTED]`)
    .replace(/\b\d{12,}\b/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function safeProviderIdentifier(value: unknown): string | null {
  const text = optionalString(value);
  return text && /^[a-zA-Z0-9_-]{1,128}$/.test(text) ? text : null;
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
  if (goodsId === null || !goodsName || minNormalPrice === null || minNormalPrice <= 0) return null;

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
    const providerError = root.error_response as Record<string, unknown>;
    const providerCode = finiteNumber(providerError.error_code) ?? optionalString(providerError.error_code);
    const providerSubCode = finiteNumber(providerError.sub_code) ?? optionalString(providerError.sub_code);
    throw new PlatformRequestError(
      "pdd",
      null,
      providerCode,
      providerSubCode,
      sanitizedProviderMessage(providerError.sub_msg),
      safeProviderIdentifier(providerError.request_id),
    );
  }
  const response = root[responseKey];
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new PlatformRequestError("pdd");
  const payload = response as Record<string, unknown>;
  const list = Array.isArray(payload[listKey]) ? payload[listKey] : [];
  const searchId = optionalString(payload.search_id);
  const goods = list.map((item) => parseGoods(item, fetchedAt)).filter((item): item is PinduoduoGoods => item !== null)
    .map((item) => searchId ? { ...item, searchId } : item);
  return {
    total: Math.max(0, Math.floor(finiteNumber(payload[totalKey]) ?? list.length)),
    rawCount: list.length,
    parseDiagnostics: parseDiagnostics(list),
    goods,
    ...(searchId ? { searchId } : {}),
  };
}

export function parsePinduoduoGoodsDetailResponse(value: unknown): PinduoduoSkuCapabilitySummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformRequestError("pdd");
  const root = value as Record<string, unknown>;
  if (root.error_response && typeof root.error_response === "object" && !Array.isArray(root.error_response)) {
    const error = root.error_response as Record<string, unknown>;
    throw new PlatformRequestError(
      "pdd", null,
      finiteNumber(error.error_code) ?? optionalString(error.error_code),
      finiteNumber(error.sub_code) ?? optionalString(error.sub_code),
      sanitizedProviderMessage(error.sub_msg), safeProviderIdentifier(error.request_id),
    );
  }
  const response = root.goods_detail_response;
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new PlatformRequestError("pdd");
  const details = (response as Record<string, unknown>).goods_details;
  const detail = Array.isArray(details) && details[0] && typeof details[0] === "object" && !Array.isArray(details[0])
    ? details[0] as Record<string, unknown> : {};
  const skuList = Array.isArray(detail.sku_list) ? detail.sku_list : [];
  let skuWithAttributeNameCount = 0;
  let skuWithAttributeValueCount = 0;
  let skuWithPriceCount = 0;
  let hasCapacity = false;
  let hasColor = false;
  let hasRegionOrVersion = false;
  let hasCondition = false;
  for (const entry of skuList) {
    const sku = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
    const specs = Array.isArray(sku.spec_list) ? sku.spec_list : [];
    let hasName = false;
    let hasValue = false;
    for (const specEntry of specs) {
      const spec = specEntry && typeof specEntry === "object" && !Array.isArray(specEntry) ? specEntry as Record<string, unknown> : {};
      const name = optionalString(spec.parent_spec_value);
      const specValue = optionalString(spec.spec_value);
      if (name) hasName = true;
      if (specValue) hasValue = true;
      if (!name || !specValue) continue;
      if (/^(?:容量|存储容量|机身存储)$/.test(name)) hasCapacity = true;
      if (/^(?:颜色|机身颜色)$/.test(name)) hasColor = true;
      if (/^(?:版本|销售版本|地区版本|网络版本)$/.test(name)) hasRegionOrVersion = true;
      if (/^(?:成色|商品状态|新旧程度)$/.test(name)) hasCondition = true;
    }
    if (hasName) skuWithAttributeNameCount += 1;
    if (hasValue) skuWithAttributeValueCount += 1;
    if ((finiteNumber(sku.min_group_price) ?? 0) > 0) skuWithPriceCount += 1;
  }
  return {
    success: true,
    skuPermissionStatus: skuList.length ? "available" : "not_returned",
    skuCount: skuList.length,
    skuWithAttributeNameCount, skuWithAttributeValueCount, skuWithPriceCount,
    hasCapacity, hasColor, hasRegionOrVersion, hasCondition,
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
      // The official recommendation endpoint accepts at most 50 goods per
      // request. Callers that need more must page with offset, never enlarge
      // this request parameter.
      limit: boundedInteger(limit, 20, 1, 50),
      offset: nonNegativeInteger(offset),
    };
    return parsePinduoduoRecommendResponse(await this.request(parameters, requestOptions), fetchedAt);
  }

  async searchGoods(
    query: string,
    { limit = 20, page = 1, optId, catId, useCustomized, listId }: PinduoduoSearchOptions = {},
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
      ...(Number.isSafeInteger(optId) && Number(optId) >= 0 ? { opt_id: Number(optId) } : {}),
      ...(Number.isSafeInteger(catId) && Number(catId) >= 0 ? { cat_id: Number(catId) } : {}),
      ...(typeof useCustomized === "boolean" ? { use_customized: useCustomized } : {}),
      ...(optionalString(listId) ? { list_id: optionalString(listId)! } : {}),
    };
    return parsePinduoduoSearchResponse(await this.request(parameters, requestOptions), fetchedAt);
  }

  async getGoodsOptChildren(parentId = 0, requestOptions: PinduoduoRequestOptions = {}): Promise<PinduoduoCategoryNode[]> {
    const value = await this.request({
      type: GOODS_OPT_METHOD,
      client_id: this.options.clientId,
      timestamp: Math.floor(this.now().getTime() / 1000),
      data_type: "JSON",
      version: "V1",
      parent_opt_id: nonNegativeInteger(parentId),
    }, requestOptions);
    return parseCategoryNodes(value, "goods_opt_get_response", "goods_opt_list", "opt_id", "opt_name", "parent_opt_id");
  }

  async getGoodsCategoryChildren(parentId = 0, requestOptions: PinduoduoRequestOptions = {}): Promise<PinduoduoCategoryNode[]> {
    const value = await this.request({
      type: GOODS_CATEGORY_METHOD,
      client_id: this.options.clientId,
      timestamp: Math.floor(this.now().getTime() / 1000),
      data_type: "JSON",
      version: "V1",
      parent_cat_id: nonNegativeInteger(parentId),
    }, requestOptions);
    return parseCategoryNodes(value, "goods_cats_get_response", "goods_cats_list", "cat_id", "cat_name", "parent_cat_id");
  }

  async getGoodsDetailCapabilities(
    { goodsSign, searchId }: { goodsSign: string; searchId?: string },
    requestOptions: PinduoduoRequestOptions = {},
  ): Promise<PinduoduoSkuCapabilitySummary> {
    const fetchedAt = this.now();
    const parameters: RequestParameters = {
      type: GOODS_DETAIL_METHOD,
      client_id: this.options.clientId,
      timestamp: Math.floor(fetchedAt.getTime() / 1000),
      data_type: "JSON",
      version: "V1",
      pid: this.options.pid,
      goods_sign: goodsSign,
      need_sku_info: true,
      ...(optionalString(searchId) ? { search_id: optionalString(searchId)! } : {}),
    };
    return parsePinduoduoGoodsDetailResponse(await this.request(parameters, requestOptions));
  }
}

function parseCategoryNodes(
  value: unknown,
  responseKey: string,
  listKey: string,
  idKey: string,
  nameKey: string,
  parentKey: string,
): PinduoduoCategoryNode[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformRequestError("pdd");
  const root = value as Record<string, unknown>;
  if (root.error_response && typeof root.error_response === "object" && !Array.isArray(root.error_response)) {
    const error = root.error_response as Record<string, unknown>;
    throw new PlatformRequestError(
      "pdd", null,
      finiteNumber(error.error_code) ?? optionalString(error.error_code),
      finiteNumber(error.sub_code) ?? optionalString(error.sub_code),
      sanitizedProviderMessage(error.sub_msg), safeProviderIdentifier(error.request_id),
    );
  }
  const response = root[responseKey];
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new PlatformRequestError("pdd");
  const list = (response as Record<string, unknown>)[listKey];
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const id = finiteNumber(item[idKey]);
    const name = optionalString(item[nameKey]);
    const parentId = finiteNumber(item[parentKey]);
    const level = finiteNumber(item.level);
    return id !== null && name && parentId !== null && level !== null
      ? [{ id, name, parentId, level }]
      : [];
  });
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
