import "server-only";

import { createHash } from "node:crypto";

import { PlatformAuthError, PlatformRequestError, toSafePlatformError } from "./errors";

const TAOBAO_ROUTER_URL = "https://eco.taobao.com/router/rest";
const MATERIAL_SEARCH_METHOD = "taobao.tbk.dg.material.optional.upgrade";
const PHONE_CATEGORY_ID = "1512";

type RequestValue = string | number | boolean;
type RequestParameters = Record<string, RequestValue>;
type TaobaoRequestOptions = { signal?: AbortSignal };

type TaobaoClientOptions = {
  appKey: string;
  appSecret: string;
  adzoneId: string;
  fetcher?: typeof fetch;
  now?: () => Date;
};

export type LiveTaobaoGovSubsidy = {
  tagName: string | null;
  stateSubsidyInfo: {
    maxRebate: number | null;
    minRebate: number | null;
    maxDiscount: number | null;
    minDiscount: number | null;
    provinceList: string[];
    finalPromotionTargetType: string | null;
  } | null;
};

export type LiveTaobaoOffer = {
  itemId: string;
  title: string;
  shortTitle: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  shopTitle: string;
  sellerId: string | null;
  pictUrl: string | null;
  smallImages: string[];
  reservePrice: number | null;
  /** The normal sale price. This is the only comparable price exposed to the adapter. */
  salePrice: number;
  /** A conditional promotion price: it may require a coupon, a region, or government-subsidy eligibility. */
  promotionPrice: number | null;
  promotionTagList: string[];
  govSubsidy: LiveTaobaoGovSubsidy | null;
  annualVol: number | null;
  totalSales: number | null;
  clickUrl: string | null;
  /** Taobao Alliance does not expose public SKU details in this integration. */
  variantId: null;
};

export type TaobaoMaterialSearchResponse = {
  items: LiveTaobaoOffer[];
  rawCount: number;
};

type TaobaoPhoneSearchOptions = {
  limit?: number;
  page?: number;
  startPrice?: number;
};

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identifier(value: unknown): string | null {
  const string = optionalString(value);
  if (string) return string;
  const number = finiteNumber(value);
  return number !== null && Number.isSafeInteger(number) ? String(number) : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function positivePrice(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? Math.floor(parsed) : null;
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>).string)
      ? (value as Record<string, unknown>).string as unknown[]
      : typeof value === "string" ? [value] : [];
  return values.flatMap((item) => optionalString(item) ? [optionalString(item)!] : []);
}

function promotionTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return stringList(value);
  return value.flatMap((entry) => {
    const tag = entry && typeof entry === "object" && !Array.isArray(entry)
      ? optionalString((entry as Record<string, unknown>).tag_name)
      : optionalString(entry);
    return tag ? [tag] : [];
  });
}

function govSubsidy(value: unknown): LiveTaobaoOffer["govSubsidy"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const subsidy = value as Record<string, unknown>;
  const state = subsidy.state_subsidy_info;
  const stateSubsidyInfo = state && typeof state === "object" && !Array.isArray(state)
    ? (() => {
      const info = state as Record<string, unknown>;
      return {
        maxRebate: finiteNumber(info.max_rebate),
        minRebate: finiteNumber(info.min_rebate),
        maxDiscount: positivePrice(info.max_discount),
        minDiscount: positivePrice(info.min_discount),
        provinceList: stringList(info.province_list),
        finalPromotionTargetType: identifier(info.final_promotion_target_type),
      };
    })()
    : null;
  return { tagName: optionalString(subsidy.tag_name), stateSubsidyInfo };
}

function sanitizedProviderMessage(value: unknown): string | null {
  const message = optionalString(value);
  if (!message) return null;
  return message
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/\b(?:token|secret|sign|session|key)\s*[=:]\s*[^\s，,；;]+/gi, (entry) => `${entry.split(/[=:]/, 1)[0]}=[REDACTED]`)
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function safeProviderIdentifier(value: unknown): string | null {
  const identifier = optionalString(value);
  return identifier && /^[a-zA-Z0-9_-]{1,128}$/.test(identifier) ? identifier : null;
}

/** TOP validates a `yyyy-MM-dd HH:mm:ss` timestamp against China Standard Time. */
export function formatTaobaoTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")} ${byType.get("hour")}:${byType.get("minute")}:${byType.get("second")}`;
}

/** Taobao Open Platform signs secret + sorted key/value pairs + secret using uppercase MD5. */
export function signTaobaoRequest(parameters: RequestParameters, appSecret: string): string {
  const serialized = Object.keys(parameters)
    .sort()
    .map((key) => `${key}${String(parameters[key])}`)
    .join("");
  return createHash("md5").update(`${appSecret}${serialized}${appSecret}`, "utf8").digest("hex").toUpperCase();
}

function parseLiveTaobaoOffer(value: unknown): LiveTaobaoOffer | null {
  const item = record(value);
  if (!item) return null;
  // Live material searches nest merchandise facts and price facts, while some
  // documented fixtures retain the older flat field layout. Support both.
  const basic = record(item.item_basic_info);
  const promotion = record(item.price_promotion_info);
  const publish = record(item.publish_info);
  const basicValue = (key: string): unknown => basic?.[key] ?? item[key];
  const promotionValue = (key: string): unknown => promotion?.[key] ?? item[key];
  const itemId = identifier(item.item_id);
  const title = optionalString(basicValue("title"));
  const shopTitle = optionalString(basicValue("shop_title"));
  const salePrice = positivePrice(promotionValue("zk_final_price"));
  if (!itemId || !title || !shopTitle || salePrice === null) return null;

  return {
    itemId,
    title,
    shortTitle: optionalString(basicValue("short_title")),
    brandName: optionalString(basicValue("brand_name")),
    categoryId: identifier(basicValue("category_id")),
    categoryName: optionalString(basicValue("category_name")),
    shopTitle,
    sellerId: identifier(basicValue("seller_id")),
    pictUrl: safeUrl(basicValue("pict_url")),
    smallImages: stringList(basicValue("small_images")).flatMap((url) => safeUrl(url) ? [safeUrl(url)!] : []),
    reservePrice: positivePrice(promotionValue("reserve_price")),
    salePrice,
    promotionPrice: positivePrice(promotionValue("final_promotion_price")),
    promotionTagList: promotionTagList(promotionValue("promotion_tag_list")),
    govSubsidy: govSubsidy(promotionValue("gov_subsidy")),
    annualVol: nonNegativeInteger(basicValue("annual_vol")),
    totalSales: nonNegativeInteger(basicValue("tk_total_sales")),
    clickUrl: safeUrl(publish?.click_url),
    variantId: null,
  };
}

/** Parses only public, documented result fields; it never retains the provider's raw response. */
export function parseTaobaoMaterialResponse(value: unknown): TaobaoMaterialSearchResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformRequestError("taobao");
  const root = value as Record<string, unknown>;
  if (root.error_response && typeof root.error_response === "object" && !Array.isArray(root.error_response)) {
    const error = root.error_response as Record<string, unknown>;
    throw new PlatformRequestError(
      "taobao",
      null,
      optionalString(error.code),
      optionalString(error.sub_code),
      sanitizedProviderMessage(error.sub_msg ?? error.msg),
      safeProviderIdentifier(error.request_id),
    );
  }
  const response = root.tbk_dg_material_optional_upgrade_response;
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new PlatformRequestError("taobao");
  const resultList = (response as Record<string, unknown>).result_list;
  const mapData = resultList && typeof resultList === "object" && !Array.isArray(resultList)
    ? (resultList as Record<string, unknown>).map_data : [];
  const entries = Array.isArray(mapData) ? mapData : [];
  return { rawCount: entries.length, items: entries.map(parseLiveTaobaoOffer).filter((item): item is LiveTaobaoOffer => item !== null) };
}

export class TaobaoClient {
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: TaobaoClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private async request(parameters: RequestParameters, requestOptions: TaobaoRequestOptions = {}): Promise<unknown> {
    const body = new URLSearchParams();
    const signed = { ...parameters, sign: signTaobaoRequest(parameters, this.options.appSecret) };
    for (const [key, value] of Object.entries(signed)) body.set(key, String(value));
    try {
      const response = await this.fetcher(TAOBAO_ROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: body.toString(),
        cache: "no-store",
        signal: requestOptions.signal,
      });
      if (!response.ok) throw Object.assign(new Error("Taobao request failed"), { status: response.status });
      return await response.json();
    } catch (error) {
      throw toSafePlatformError("taobao", error);
    }
  }

  async searchPhoneGoods(query: string, options: TaobaoPhoneSearchOptions = {}, requestOptions: TaobaoRequestOptions = {}): Promise<TaobaoMaterialSearchResponse> {
    const keyword = query.trim();
    if (!keyword) return { items: [], rawCount: 0 };
    const parameters: RequestParameters = {
      method: MATERIAL_SEARCH_METHOD,
      app_key: this.options.appKey,
      timestamp: formatTaobaoTimestamp(this.now()),
      format: "json",
      v: "2.0",
      sign_method: "md5",
      adzone_id: this.options.adzoneId,
      cat: PHONE_CATEGORY_ID,
      q: keyword,
      page_no: boundedInteger(options.page, 1, 1, Number.MAX_SAFE_INTEGER),
      page_size: boundedInteger(options.limit, 20, 1, 100),
      ...(typeof options.startPrice === "number" && Number.isFinite(options.startPrice) && options.startPrice >= 0
        ? { start_price: options.startPrice } : {}),
    };
    return parseTaobaoMaterialResponse(await this.request(parameters, requestOptions));
  }
}

export function createTaobaoClientFromEnv(): TaobaoClient | null {
  const appKey = process.env.TAOBAO_APP_KEY?.trim();
  const appSecret = process.env.TAOBAO_APP_SECRET?.trim();
  const adzoneId = process.env.TAOBAO_ADZONE_ID?.trim();
  if (!appKey || !appSecret || !adzoneId) return null;
  return new TaobaoClient({ appKey, appSecret, adzoneId });
}

export function missingTaobaoConfiguration(): PlatformAuthError {
  return new PlatformAuthError("taobao");
}
