import "server-only";

import { createHash } from "node:crypto";

import { PlatformAuthError, PlatformRequestError, toSafePlatformError } from "./errors";

const PINDUODUO_API_ROUTER = "https://gw-api.pinduoduo.com/api/router";
const RECOMMEND_METHOD = "pdd.ddk.goods.recommend.get";

type RequestValue = string | number | boolean;
type RequestParameters = Record<string, RequestValue>;

export type PinduoduoRecommendedGoods = {
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
};

export type PinduoduoRecommendResponse = {
  total: number;
  goods: PinduoduoRecommendedGoods[];
};

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

function parseGoods(value: unknown): PinduoduoRecommendedGoods | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const goodsId = finiteNumber(item.goods_id) ?? optionalString(item.goods_id);
  const goodsName = optionalString(item.goods_name);
  const mallName = optionalString(item.mall_name);
  const minNormalPrice = fenToYuan(item.min_normal_price);
  if (goodsId === null || !goodsName || !mallName || minNormalPrice === null || minNormalPrice <= 0) return null;

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
  };
}

export function parsePinduoduoRecommendResponse(value: unknown): PinduoduoRecommendResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformRequestError("pdd");
  const root = value as Record<string, unknown>;
  if (root.error_response) throw new PlatformRequestError("pdd");
  const response = root.goods_basic_detail_response;
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new PlatformRequestError("pdd");
  const payload = response as Record<string, unknown>;
  const list = Array.isArray(payload.list) ? payload.list : [];
  return {
    total: Math.max(0, Math.floor(finiteNumber(payload.total) ?? list.length)),
    goods: list.map(parseGoods).filter((item): item is PinduoduoRecommendedGoods => item !== null),
  };
}

export class PinduoduoClient {
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: PinduoduoClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getRecommendedGoods({ limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<PinduoduoRecommendResponse> {
    const parameters: RequestParameters = {
      type: RECOMMEND_METHOD,
      client_id: this.options.clientId,
      timestamp: Math.floor(this.now().getTime() / 1000),
      data_type: "JSON",
      version: "V1",
      pid: this.options.pid,
      limit: Math.min(400, Math.max(1, Math.floor(limit))),
      offset: Math.max(0, Math.floor(offset)),
    };
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
      });
      if (!response.ok) throw Object.assign(new Error("Pinduoduo request failed"), { status: response.status });
      return parsePinduoduoRecommendResponse(await response.json());
    } catch (error) {
      throw toSafePlatformError("pdd", error);
    }
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
