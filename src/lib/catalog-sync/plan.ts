import type { PlatformSearchResult } from "@/lib/platforms/types";
import type { Product } from "@/types/catalog";

import { matchPhoneProduct } from "./matching";
import { normalizePlatformSearchResult } from "./normalize";
import type { CatalogSyncPlan } from "./types";

export function createOfferIdentity(platform: string, externalProductId: string, externalVariantId: string | undefined, storage: string | null, color: string | null): string {
  return externalVariantId ? `${platform}:${externalVariantId.trim()}` : `${platform}:${externalProductId.trim()}:${storage ?? "unknown"}:${color ?? "unknown"}`;
}

export function buildCatalogSyncPlan(inputs: PlatformSearchResult[], products: Product[], collectedAt?: string): CatalogSyncPlan {
  const plan: CatalogSyncPlan = { matchedOffers: [], unmatchedItems: [], ambiguousItems: [], rejectedItems: [], summary: { input: inputs.length, normalized: 0, rejected: 0, matched: 0, unmatched: 0, ambiguous: 0 } };
  for (const input of inputs) {
    const normalized = normalizePlatformSearchResult(input, collectedAt);
    if (!normalized.ok) { plan.rejectedItems.push(normalized.rejection); continue; }
    plan.summary.normalized++;
    const match = matchPhoneProduct(normalized.value, products);
    if (match.status === "unmatched") { plan.unmatchedItems.push(normalized.value); continue; }
    if (match.status === "ambiguous") { plan.ambiguousItems.push(normalized.value); continue; }
    plan.matchedOffers.push({ normalized: normalized.value, product: match.product, variant: match.variant, offerIdentity: createOfferIdentity(normalized.value.platform, normalized.value.externalProductId, normalized.value.externalVariantId ?? undefined, normalized.value.storage, normalized.value.color) });
  }
  plan.summary.rejected = plan.rejectedItems.length; plan.summary.matched = plan.matchedOffers.length; plan.summary.unmatched = plan.unmatchedItems.length; plan.summary.ambiguous = plan.ambiguousItems.length;
  return plan;
}
