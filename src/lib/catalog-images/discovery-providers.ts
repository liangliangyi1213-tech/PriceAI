import "server-only";

import { getPlatformAdapter } from "@/lib/platforms/registry";
import {
  PinduoduoAdapter,
  type PinduoduoPhoneImageCandidateResult,
} from "@/lib/platforms/pinduoduo-adapter";
import { TaobaoAdapter, type TaobaoPhoneOfferResult } from "@/lib/platforms/taobao-adapter";
import type { Product } from "@/types/catalog";

import type {
  CatalogImageDiscoveryItem,
  CatalogImageDiscoveryProvider,
} from "./discovery-service";

const DEFAULT_PROVIDER_CANDIDATE_LIMIT = 3;
const DEFAULT_PROVIDER_SEARCH_LIMIT = 20;

type TaobaoDiscoveryAdapter = Pick<TaobaoAdapter, "searchPhoneOffersForProduct">;
type PinduoduoDiscoveryAdapter = Pick<PinduoduoAdapter, "searchPhoneImageCandidatesForProduct">;

function matchPriority(result: TaobaoPhoneOfferResult): number {
  return result.match.status === "matched" ? 0
    : result.match.status === "ambiguous" ? 1
      : result.match.status === "rejected" ? 2 : 3;
}

function taobaoItem(result: TaobaoPhoneOfferResult): CatalogImageDiscoveryItem {
  if (result.match.status !== "matched") {
    return { source: { platform: "taobao", listing: result.offer }, match: { status: result.match.status } };
  }
  return {
    source: { platform: "taobao", listing: result.offer },
    match: {
      status: "matched",
      product: result.match.product,
      matchConfidence: 1,
      evidence: { matcher: "taobao_phone_strict", signals: ["brand", "model", "category"] },
    },
  };
}

export function createTaobaoCatalogImageDiscoveryProvider(
  adapter: TaobaoDiscoveryAdapter,
  limit = DEFAULT_PROVIDER_CANDIDATE_LIMIT,
): CatalogImageDiscoveryProvider {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_PROVIDER_CANDIDATE_LIMIT;
  return {
    platform: "taobao",
    matcher: "phone",
    async discover(product: Product, signal: AbortSignal) {
      const results = await adapter.searchPhoneOffersForProduct(
        product,
        { limit: DEFAULT_PROVIDER_SEARCH_LIMIT },
        { signal },
      );
      return [...results]
        .sort((left, right) => matchPriority(left) - matchPriority(right))
        .slice(0, boundedLimit)
        .map(taobaoItem);
    },
  };
}

function pinduoduoItem(result: PinduoduoPhoneImageCandidateResult): CatalogImageDiscoveryItem {
  return {
    source: { platform: "pinduoduo", listing: result.listing },
    match: {
      status: "matched",
      product: result.product,
      matchConfidence: 1,
      // Deliberately product-level. Text attributes are not structured SKU evidence.
      evidence: { matcher: "pinduoduo_phone_strict", signals: ["brand", "model", "category"] },
    },
  };
}

export function createPinduoduoCatalogImageDiscoveryProvider(
  adapter: PinduoduoDiscoveryAdapter,
  limit = DEFAULT_PROVIDER_CANDIDATE_LIMIT,
): CatalogImageDiscoveryProvider {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_PROVIDER_CANDIDATE_LIMIT;
  return {
    platform: "pdd",
    matcher: "phone",
    async discover(product: Product, signal: AbortSignal) {
      const results = await adapter.searchPhoneImageCandidatesForProduct(product, { limit: boundedLimit }, { signal });
      return results.slice(0, boundedLimit).map(pinduoduoItem);
    },
  };
}

export function getCatalogImageDiscoveryProviders(): readonly CatalogImageDiscoveryProvider[] {
  const taobao = getPlatformAdapter("taobao");
  const pdd = getPlatformAdapter("pdd");
  return [
    ...(taobao instanceof TaobaoAdapter ? [createTaobaoCatalogImageDiscoveryProvider(taobao)] : []),
    ...(pdd instanceof PinduoduoAdapter ? [createPinduoduoCatalogImageDiscoveryProvider(pdd)] : []),
  ];
}
