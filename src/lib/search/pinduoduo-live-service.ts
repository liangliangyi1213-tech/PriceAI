import "server-only";

import { createPinduoduoClientFromEnv, type PinduoduoClient, type PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import type { Product } from "@/types/catalog";
import { selectLivePinduoduoOffersWithDiagnostics, type LivePinduoduoOffer } from "./pinduoduo-live-offer";

const CACHE_TTL_MS = 600_000;
const MAX_GOODS_PER_QUERY = 400;
const DEFAULT_REQUEST_DEADLINE_MS = 8_000;

export type PinduoduoGoodsCache = Map<string, { expiresAt: number; goods: PinduoduoGoods[] }>;
type ServiceOptions = {
  client?: Pick<PinduoduoClient, "searchGoods" | "getRecommendedGoods"> | null;
  cache?: PinduoduoGoodsCache;
  now?: () => number;
  maxCacheEntries?: number;
  timeoutMs?: number;
  diagnostic?: (event: PinduoduoDiagnosticEvent) => void;
};

type ApiMethod = "pdd.ddk.goods.search" | "pdd.ddk.goods.recommend.get";
export type PinduoduoDiagnosticEvent =
  | ({ event: "api_response"; method: ApiMethod; success: true; providerTotal: number; rawCount: number; parsedCount: number } & import("@/lib/platforms/pinduoduo-client").PinduoduoParseDiagnostics)
  | { event: "api_response"; method: ApiMethod; success: false; errorCode: string | number | null }
  | ({ event: "selection"; source: "search" | "recommend" } & import("./pinduoduo-live-offer").PinduoduoSelectionDiagnostics);

function defaultDiagnostic(event: PinduoduoDiagnosticEvent): void {
  console.info("[pdd-live]", JSON.stringify(event));
}

function safeProviderCode(error: unknown): string | number | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as Record<string, unknown>).providerCode;
  return typeof code === "string" || typeof code === "number" ? code : null;
}

export function createLivePinduoduoService(options: ServiceOptions = {}) {
  const cache: PinduoduoGoodsCache = options.cache ?? new Map();
  const now = options.now ?? Date.now;
  const maxEntries = options.maxCacheEntries !== undefined && Number.isFinite(options.maxCacheEntries)
    ? Math.max(1, Math.floor(options.maxCacheEntries)) : 100;
  const timeoutMs = options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.floor(options.timeoutMs)) : DEFAULT_REQUEST_DEADLINE_MS;
  const diagnostic = options.diagnostic ?? defaultDiagnostic;
  return async function getLivePinduoduoOffers(products: readonly Product[], query: string): Promise<Map<string, LivePinduoduoOffer[]>> {
    const key = query.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) return new Map();
    try {
      const client = options.client === undefined ? createPinduoduoClientFromEnv() : options.client;
      if (!client) return new Map();
      const timestamp = now();
      for (const [cachedKey, entry] of cache) {
        if (entry.expiresAt <= timestamp) cache.delete(cachedKey);
      }
      let goods = cache.get(key)?.goods;
      let source: "search" | "recommend" = "search";
      if (!goods) {
        const pool = await withDeadline(async (signal) => {
          let search;
          try {
            search = await client.searchGoods(key, { limit: 100 }, { signal });
            diagnostic({ event: "api_response", method: "pdd.ddk.goods.search", success: true, providerTotal: search.total, rawCount: search.rawCount, parsedCount: search.goods.length, ...search.parseDiagnostics });
          } catch (error) {
            diagnostic({ event: "api_response", method: "pdd.ddk.goods.search", success: false, errorCode: safeProviderCode(error) });
            throw error;
          }
          if (search.goods.length) return search.goods;
          source = "recommend";
          try {
            const recommend = await client.getRecommendedGoods({ limit: MAX_GOODS_PER_QUERY }, { signal });
            diagnostic({ event: "api_response", method: "pdd.ddk.goods.recommend.get", success: true, providerTotal: recommend.total, rawCount: recommend.rawCount, parsedCount: recommend.goods.length, ...recommend.parseDiagnostics });
            return recommend.goods;
          } catch (error) {
            diagnostic({ event: "api_response", method: "pdd.ddk.goods.recommend.get", success: false, errorCode: safeProviderCode(error) });
            throw error;
          }
        }, timeoutMs);
        // Whitelist parsed public fields. Never retain request signing material,
        // goods_sign, response envelopes, arbitrary extra properties or errors.
        goods = pool.slice(0, MAX_GOODS_PER_QUERY).map(publicGoods);
        cache.delete(key);
        while (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
        cache.set(key, { goods, expiresAt: now() + CACHE_TTL_MS });
      }
      const selected = selectLivePinduoduoOffersWithDiagnostics(products, key, goods);
      diagnostic({ event: "selection", source, ...selected.diagnostics });
      return selected.offers;
    } catch {
      // An optional live source must never replace or break the catalog.
      return new Map();
    }
  };
}

async function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Pinduoduo live request deadline exceeded"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function publicGoods(item: PinduoduoGoods): PinduoduoGoods {
  return {
    goodsId: item.goodsId, goodsSign: null, goodsName: item.goodsName,
    goodsThumbnailUrl: item.goodsThumbnailUrl, goodsImageUrl: item.goodsImageUrl,
    categoryName: item.categoryName, mallName: item.mallName, merchantType: item.merchantType,
    salesTip: item.salesTip, realtimeSalesTip: item.realtimeSalesTip,
    hasCoupon: item.hasCoupon, couponPrice: item.couponPrice,
    couponMinOrderAmount: item.couponMinOrderAmount, minNormalPrice: item.minNormalPrice,
    promotionRate: item.promotionRate, fetchedAt: new Date(item.fetchedAt.getTime()),
    ...(item.minGroupPrice !== undefined ? { minGroupPrice: item.minGroupPrice } : {}),
    ...(item.extraCouponAmount !== undefined ? { extraCouponAmount: item.extraCouponAmount } : {}),
    ...(item.optName !== undefined ? { optName: item.optName } : {}),
    ...(item.catIds !== undefined ? { catIds: [...item.catIds] } : {}),
    ...(item.goodsDescription !== undefined ? { goodsDescription: item.goodsDescription } : {}),
  };
}

/** Per-process bounded cache; the signed HTTP requests themselves use no-store. */
export const getLivePinduoduoOffers = createLivePinduoduoService();
