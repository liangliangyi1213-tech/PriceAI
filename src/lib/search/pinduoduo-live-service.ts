import "server-only";

import { createPinduoduoClientFromEnv, type PinduoduoClient, type PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import type { Product } from "@/types/catalog";
import { selectLivePinduoduoOffersWithDiagnostics, type LivePinduoduoOffer } from "./pinduoduo-live-offer";
import { runPinduoduoRecallExperiment, type RecallExperimentResult } from "./pinduoduo-recall-experiment";

const CACHE_TTL_MS = 600_000;
const MAX_GOODS_PER_QUERY = 400;
const MAX_RECOMMENDED_GOODS_PER_REQUEST = 50;
const MAX_SEARCH_PAGES = 5;
const DEFAULT_REQUEST_DEADLINE_MS = 8_000;
const RECALL_EXPERIMENT_DEADLINE_MS = 20_000;
const PRODUCTION_RECALL_EXPERIMENT_QUERIES = new Set(["iphone 16 pro"]);
const SKU_DIAGNOSTIC_TARGETS = {
  "iphone 16 pro": { productSlug: "apple-iphone-16-pro", productKey: "iphone-16-pro" },
  "mate 70 pro": { productSlug: "huawei-mate-70-pro", productKey: "mate-70-pro" },
  "小米 15": { productSlug: "xiaomi-15", productKey: "xiaomi-15" },
  "pura 70": { productSlug: "huawei-pura-70", productKey: "pura-70" },
  "find x8": { productSlug: "oppo-find-x8", productKey: "find-x8" },
  "x200": { productSlug: "vivo-x200", productKey: "x200" },
} as const;
type SkuDiagnosticProductKey = typeof SKU_DIAGNOSTIC_TARGETS[keyof typeof SKU_DIAGNOSTIC_TARGETS]["productKey"];

export type PinduoduoGoodsCache = Map<string, { expiresAt: number; goods: PinduoduoGoods[] }>;
type ServiceOptions = {
  client?: (Pick<PinduoduoClient, "searchGoods" | "getRecommendedGoods"> & Partial<Pick<PinduoduoClient, "getGoodsOptChildren" | "getGoodsCategoryChildren" | "getGoodsDetailCapabilities">>) | null;
  cache?: PinduoduoGoodsCache;
  now?: () => number;
  maxCacheEntries?: number;
  timeoutMs?: number;
  diagnostic?: (event: PinduoduoDiagnosticEvent) => void;
};

type ApiMethod = "pdd.ddk.goods.search" | "pdd.ddk.goods.recommend.get";
export type PinduoduoDiagnosticEvent =
  | ({ event: "api_response"; method: ApiMethod; success: true; providerTotal: number; rawCount: number; parsedCount: number } & import("@/lib/platforms/pinduoduo-client").PinduoduoParseDiagnostics)
  | { event: "api_response"; method: ApiMethod; success: false; errorCode: string | number | null; subCode: string | number | null; subMessage: string | null; requestId: string | null }
  | ({ event: "selection"; source: "search" | "recommend" } & import("./pinduoduo-live-offer").PinduoduoSelectionDiagnostics)
  | ({ event: "recall_experiment" } & RecallExperimentResult)
  | { event: "sku_detail_candidate_summary"; productKey: SkuDiagnosticProductKey; productLevelCandidateCount: number; queryableCandidateCount: number; detailRequestCount: number }
  | ({ event: "sku_detail_diagnostic"; productKey: SkuDiagnosticProductKey; candidateIndex: number }
      & (import("@/lib/platforms/pinduoduo-client").PinduoduoSkuCapabilitySummary
        | { success: false; skuPermissionStatus: "denied" | "unknown"; errorCode: string | number | null; subCode: string | number | null; subMessage: string | null }));

function defaultDiagnostic(event: PinduoduoDiagnosticEvent): void {
  console.info("[pdd-live]", JSON.stringify(event));
}

function safeProviderFailure(error: unknown) {
  if (!error || typeof error !== "object") return { errorCode: null, subCode: null, subMessage: null, requestId: null };
  const record = error as Record<string, unknown>;
  const safeCode = (value: unknown) => typeof value === "string" || typeof value === "number" ? value : null;
  const safeText = (value: unknown) => typeof value === "string" ? value.slice(0, 160) : null;
  return {
    errorCode: safeCode(record.providerCode),
    subCode: safeCode(record.providerSubCode),
    subMessage: safeText(record.providerSubMessage),
    requestId: safeText(record.providerRequestId),
  };
}

function safeSkuFailure(error: unknown) {
  const failure = safeProviderFailure(error);
  const message = failure.subMessage?.replace(/\b(?:goods_sign|search_id|goods_id|pid|sign|token|secret)\s*[=:]\s*[^\s，,；;]+/gi, (entry) => `${entry.split(/[=:]/, 1)[0]}=[REDACTED]`)
    .replace(/\b\d{12,}\b/g, "[REDACTED]") ?? null;
  const denied = failure.errorCode === 20031 || failure.errorCode === 30000
    || /permission|权限|无权/i.test(`${failure.subCode ?? ""} ${message ?? ""}`);
  return {
    success: false as const,
    skuPermissionStatus: denied ? "denied" as const : "unknown" as const,
    errorCode: failure.errorCode, subCode: failure.subCode, subMessage: message,
  };
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
    const experimentEnabled = process.env.PDD_RECALL_EXPERIMENT === "1"
      || (process.env.VERCEL_ENV === "production" && PRODUCTION_RECALL_EXPERIMENT_QUERIES.has(key));
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
        const poolResult = await withDeadline(async (signal) => {
          if (
            experimentEnabled
            && typeof client.getGoodsOptChildren === "function"
            && typeof client.getGoodsCategoryChildren === "function"
          ) {
            const experiment = await runPinduoduoRecallExperiment(
              client as PinduoduoClient,
              products,
              key,
              signal,
            );
            diagnostic({ event: "recall_experiment", ...experiment });
          }
          const searchedGoods: PinduoduoGoods[] = [];
          for (let page = 1; page <= MAX_SEARCH_PAGES; page += 1) {
            let search;
            try {
              search = await client.searchGoods(key, { limit: 100, page }, { signal });
              diagnostic({ event: "api_response", method: "pdd.ddk.goods.search", success: true, providerTotal: search.total, rawCount: search.rawCount, parsedCount: search.goods.length, ...search.parseDiagnostics });
            } catch (error) {
              diagnostic({ event: "api_response", method: "pdd.ddk.goods.search", success: false, ...safeProviderFailure(error) });
              throw error;
            }
            if (!search.goods.length) {
              if (page > 1 || searchedGoods.length) return { goods: searchedGoods, searchId: search.searchId };
              source = "recommend";
              try {
                const recommend = await client.getRecommendedGoods({ limit: MAX_RECOMMENDED_GOODS_PER_REQUEST }, { signal });
                diagnostic({ event: "api_response", method: "pdd.ddk.goods.recommend.get", success: true, providerTotal: recommend.total, rawCount: recommend.rawCount, parsedCount: recommend.goods.length, ...recommend.parseDiagnostics });
                return { goods: recommend.goods, searchId: recommend.searchId };
              } catch (error) {
                diagnostic({ event: "api_response", method: "pdd.ddk.goods.recommend.get", success: false, ...safeProviderFailure(error) });
                throw error;
              }
            }
            searchedGoods.push(...search.goods);
            // Keep the strict subject/accessory gate. Pagination only gives the
            // provider more chances to return a qualifying whole product.
            if (selectLivePinduoduoOffersWithDiagnostics(products, key, searchedGoods).offers.size > 0) return { goods: searchedGoods, searchId: search.searchId };
          }
          return { goods: searchedGoods, searchId: undefined };
        }, experimentEnabled ? Math.max(timeoutMs, RECALL_EXPERIMENT_DEADLINE_MS) : timeoutMs);
        const pool = poolResult.goods;
        const skuDiagnosticTarget = SKU_DIAGNOSTIC_TARGETS[key as keyof typeof SKU_DIAGNOSTIC_TARGETS];
        if (
          process.env.PDD_SKU_DIAGNOSTIC_ENABLED === "1"
          && skuDiagnosticTarget
          && typeof client.getGoodsDetailCapabilities === "function"
        ) {
          const product = products.find((item) => item.slug === skuDiagnosticTarget.productSlug);
          const selectedForProduct = product
            ? selectLivePinduoduoOffersWithDiagnostics([product], key, pool).offers.get(product.id) ?? []
            : [];
          const queryableCandidates = selectedForProduct.flatMap((offer) => {
            const item = pool.find((entry) => entry.goodsId === offer.goodsId);
            return item?.goodsSign ? [item] : [];
          });
          const candidates = queryableCandidates.slice(0, 2);
          diagnostic({
            event: "sku_detail_candidate_summary",
            productKey: skuDiagnosticTarget.productKey,
            productLevelCandidateCount: selectedForProduct.length,
            queryableCandidateCount: queryableCandidates.length,
            detailRequestCount: candidates.length,
          });
          await Promise.all(candidates.map(async (candidate, index) => {
            try {
              const searchId = candidate.searchId ?? poolResult.searchId;
              const summary = await withDeadline((signal) => client.getGoodsDetailCapabilities!({
                goodsSign: candidate.goodsSign!,
                ...(searchId ? { searchId } : {}),
              }, { signal }), timeoutMs);
              diagnostic({ event: "sku_detail_diagnostic", productKey: skuDiagnosticTarget.productKey, candidateIndex: index + 1, ...summary });
            } catch (error) {
              diagnostic({ event: "sku_detail_diagnostic", productKey: skuDiagnosticTarget.productKey, candidateIndex: index + 1, ...safeSkuFailure(error) });
            }
          }));
        }
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
