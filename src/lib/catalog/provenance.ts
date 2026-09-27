import type { Offer } from "@/types/catalog";

export type OfferProvenanceKind =
  | "mock"
  | "seed"
  | "catalog"
  | "platform_sync"
  | "verified_platform"
  | "live_platform"
  | "unknown";

export type OfferProvenanceTrust = "demonstration" | "recorded" | "verified" | "live" | "unknown";
export type FactUsage = "display" | "sort" | "filter" | "score" | "ai" | "compare";
export type OfferFact = "price" | "rating" | "sales" | "shipping" | "warranty";

export type CanonicalOfferProvenance = Readonly<{
  kind: OfferProvenanceKind;
  trust: OfferProvenanceTrust;
  demonstration: boolean;
}>;

const knownSources = new Set<OfferProvenanceKind>([
  "mock",
  "seed",
  "catalog",
  "platform_sync",
  "verified_platform",
  "live_platform",
  "unknown",
]);

const legacySeedFingerprints = new Map([
  ["京东", { suffix: "jd", seller: "品牌旗舰店", title: "官方正品" }],
  ["淘宝", { suffix: "tb", seller: "官方旗舰店", title: "官方正品" }],
  ["拼多多", { suffix: "pdd", seller: "百亿补贴", title: "正品补贴" }],
]);

function normalizedSource(source: string | undefined): string {
  return source?.trim().toLowerCase() ?? "";
}

/**
 * Temporary compatibility for the exact deterministic SQL seed fingerprint
 * used before source was written explicitly. Remove after a data migration
 * marks those rows as seed.
 */
function isLegacySqlSeedOffer(offer: Pick<Offer, "id" | "variantId" | "platform" | "seller" | "title" | "url" | "source">): boolean {
  const source = normalizedSource(offer.source);
  const fingerprint = legacySeedFingerprints.get(offer.platform);
  return (source === "catalog" || source === "")
    && offer.url.trim() === "#"
    && fingerprint !== undefined
    && offer.id === `${offer.variantId}-${fingerprint.suffix}`
    && offer.seller === fingerprint.seller
    && offer.title === fingerprint.title;
}

export function classifyOfferProvenance(
  offer: Pick<Offer, "id" | "variantId" | "platform" | "seller" | "title" | "url" | "source">,
): CanonicalOfferProvenance {
  if (isLegacySqlSeedOffer(offer)) {
    return { kind: "seed", trust: "demonstration", demonstration: true };
  }

  const source = normalizedSource(offer.source);
  const kind: OfferProvenanceKind = knownSources.has(source as OfferProvenanceKind)
    ? source as OfferProvenanceKind
    : "unknown";

  if (kind === "mock" || kind === "seed") {
    return { kind, trust: "demonstration", demonstration: true };
  }
  if (kind === "verified_platform") {
    return { kind, trust: "verified", demonstration: false };
  }
  if (kind === "catalog" || kind === "platform_sync") {
    return { kind, trust: "recorded", demonstration: false };
  }
  if (kind === "live_platform") {
    return { kind, trust: "live", demonstration: false };
  }
  return { kind: "unknown", trust: "unknown", demonstration: false };
}

function isFactReady(offer: Offer, fact: OfferFact): boolean {
  if (fact === "price") return Number.isFinite(offer.price) && offer.price > 0;
  if (fact === "rating") return Number.isFinite(offer.rating) && offer.rating >= 0 && offer.rating <= 5;
  if (fact === "sales") return Number.isFinite(offer.sales) && offer.sales >= 0;
  const value = fact === "shipping" ? offer.shipping : offer.warranty;
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== "信息未提供";
}

export function canUseOfferFact(offer: Offer, fact: OfferFact, usage: FactUsage): boolean {
  if (!isFactReady(offer, fact)) return false;
  if (usage === "display") return true;

  const provenance = classifyOfferProvenance(offer);
  if (provenance.trust === "demonstration" || provenance.trust === "verified") return true;

  // Recorded Catalog prices retain their existing formal comparison role, but
  // unverified ratings, sales and service claims do not gain decision trust.
  return provenance.trust === "recorded"
    && fact === "price"
    && (usage === "sort" || usage === "filter" || usage === "compare");
}

export function canUseOfferForScore(offer: Offer): boolean {
  return canUseOfferFact(offer, "price", "score")
    && canUseOfferFact(offer, "rating", "score")
    && canUseOfferFact(offer, "sales", "score");
}

export function canUseOfferForAi(offer: Offer): boolean {
  return canUseOfferFact(offer, "price", "ai")
    && canUseOfferFact(offer, "rating", "ai")
    && canUseOfferFact(offer, "sales", "ai");
}

export function canUseOfferForCompare(offer: Offer): boolean {
  return canUseOfferFact(offer, "price", "compare");
}
