import "server-only";

import { getPlatformAdapter } from "@/lib/platforms/registry";
import { TaobaoAdapter, type TaobaoPhoneOfferResult } from "@/lib/platforms/taobao-adapter";
import type { Product } from "@/types/catalog";

import type { LiveTaobaoProductOffer } from "./taobao-live-offer";

const CACHE_TTL_MS = 600_000;
const DEFAULT_REQUEST_DEADLINE_MS = 8_000;
const MAX_OFFERS_PER_PRODUCT = 5;

type ProductSearchAdapter = {
  searchPhoneOffersForProduct(product: Product): Promise<TaobaoPhoneOfferResult[]>;
};

export type TaobaoLiveOfferCache = Map<string, { expiresAt: number; offers: LiveTaobaoProductOffer[] }>;

type ServiceOptions = {
  adapter?: ProductSearchAdapter | null;
  cache?: TaobaoLiveOfferCache;
  now?: () => number;
  timeoutMs?: number;
};

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function publicOffer(productId: string, result: TaobaoPhoneOfferResult): LiveTaobaoProductOffer | null {
  if (result.match.status !== "matched") return null;
  const offer = result.offer;
  const itemId = offer.itemId.trim();
  const title = offer.title.trim();
  const merchant = offer.shopTitle.trim();
  if (!itemId || !title || !merchant || !Number.isFinite(offer.salePrice) || offer.salePrice <= 0) return null;
  const promotionPrice = offer.promotionPrice !== null
    && Number.isFinite(offer.promotionPrice)
    && offer.promotionPrice > 0
    ? offer.promotionPrice
    : null;
  const promotionTags = [...new Set(offer.promotionTagList
    .map((tag) => tag.trim().slice(0, 40))
    .filter(Boolean))].slice(0, 5);

  return {
    productId,
    variantId: null,
    itemId,
    title,
    image: safeHttpsUrl(offer.pictUrl ?? offer.smallImages[0] ?? null),
    merchant,
    salePrice: offer.salePrice,
    promotionPrice,
    promotionTags,
    productUrl: safeHttpsUrl(offer.clickUrl),
    source: "live",
  };
}

function defaultAdapter(): ProductSearchAdapter | null {
  const adapter = getPlatformAdapter("taobao");
  return adapter instanceof TaobaoAdapter ? adapter : null;
}

async function withDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Taobao live request deadline exceeded")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createLiveTaobaoService(options: ServiceOptions = {}) {
  const cache = options.cache ?? new Map<string, { expiresAt: number; offers: LiveTaobaoProductOffer[] }>();
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.floor(options.timeoutMs))
    : DEFAULT_REQUEST_DEADLINE_MS;

  return async function getLiveTaobaoOffers(products: readonly Product[]): Promise<Map<string, LiveTaobaoProductOffer[]>> {
    if (!products.length) return new Map();
    const adapter = options.adapter === undefined ? defaultAdapter() : options.adapter;
    if (!adapter) return new Map();
    const timestamp = now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= timestamp) cache.delete(key);
    }

    const entries = await Promise.all(products.map(async (product) => {
      const cacheKey = `${product.id}:${product.name.normalize("NFKC").trim().toLowerCase()}`;
      const cached = cache.get(cacheKey);
      if (cached) return [product.id, cached.offers] as const;
      try {
        const results = await withDeadline(adapter.searchPhoneOffersForProduct(product), timeoutMs);
        const seen = new Set<string>();
        const offers = results.flatMap((result) => {
          const mapped = publicOffer(product.id, result);
          if (!mapped || seen.has(mapped.itemId)) return [];
          seen.add(mapped.itemId);
          return [mapped];
        }).slice(0, MAX_OFFERS_PER_PRODUCT);
        cache.set(cacheKey, { offers, expiresAt: now() + CACHE_TTL_MS });
        return [product.id, offers] as const;
      } catch {
        // Optional live data must never replace or break the catalog search.
        return [product.id, []] as const;
      }
    }));

    return new Map(entries.filter((entry): entry is readonly [string, LiveTaobaoProductOffer[]] => entry[1].length > 0));
  };
}

export const getLiveTaobaoOffers = createLiveTaobaoService();
