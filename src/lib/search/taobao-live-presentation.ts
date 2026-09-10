import type { LiveTaobaoProductOffer } from "./taobao-live-offer";

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

const CONFIGURATION_PATTERN = /\d+(?:\.\d+)?\s*(?:gb|tb)|pro\s*max|pro|max|plus|ultra|mini|\bse\b|官方标配|标准版|单机|套装|套餐|礼盒|赠品/giu;

function configurationSignals(title: string): string[] {
  return [...title.matchAll(CONFIGURATION_PATTERN)]
    .map((match) => normalizedText(match[0]))
    .filter(Boolean)
    .sort();
}

function sameSignals(left: string, right: string): boolean {
  const leftSignals = configurationSignals(left);
  const rightSignals = configurationSignals(right);
  return leftSignals.length === rightSignals.length
    && leftSignals.every((signal, index) => signal === rightSignals[index]);
}

function bigrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function titleSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizedText(left);
  const normalizedRight = normalizedText(right);
  if (normalizedLeft === normalizedRight) return 1;
  if (!normalizedLeft || !normalizedRight) return 0;
  const lengthRatio = Math.min(normalizedLeft.length, normalizedRight.length) / Math.max(normalizedLeft.length, normalizedRight.length);
  if (lengthRatio < 0.94) return 0;
  const leftBigrams = bigrams(normalizedLeft);
  const rightBigrams = bigrams(normalizedRight);
  let intersection = 0;
  for (const pair of leftBigrams) {
    if (rightBigrams.has(pair)) intersection += 1;
  }
  return (2 * intersection) / (leftBigrams.size + rightBigrams.size);
}

function informationScore(offer: LiveTaobaoProductOffer): number {
  return (offer.image ? 2 : 0)
    + (offer.merchant.trim() ? 1 : 0)
    + (offer.productUrl ? 2 : 0)
    + (offer.promotionPrice !== null ? 1 : 0)
    + (offer.promotionTags.length ? 1 : 0);
}

function preferredOffer(left: LiveTaobaoProductOffer, right: LiveTaobaoProductOffer): LiveTaobaoProductOffer {
  const scoreDifference = informationScore(right) - informationScore(left);
  if (scoreDifference !== 0) return scoreDifference > 0 ? right : left;
  return right.salePrice < left.salePrice ? right : left;
}

function isConservativeDuplicate(left: LiveTaobaoProductOffer, right: LiveTaobaoProductOffer): boolean {
  const merchant = normalizedText(left.merchant);
  if (!merchant || merchant !== normalizedText(right.merchant)) return false;
  if (!sameSignals(left.title, right.title)) return false;
  return titleSimilarity(left.title, right.title) >= 0.96;
}

/**
 * Prepares already strictly-matched Taobao listings for display only.
 * This does not alter product matching, catalog prices, variants, or scoring.
 */
export function prepareLiveTaobaoOffers(
  offers: readonly LiveTaobaoProductOffer[],
): LiveTaobaoProductOffer[] {
  const byItemId = new Map<string, LiveTaobaoProductOffer>();
  for (const offer of offers) {
    const existing = byItemId.get(offer.itemId);
    byItemId.set(offer.itemId, existing ? preferredOffer(existing, offer) : offer);
  }

  const deduplicated: LiveTaobaoProductOffer[] = [];
  for (const offer of byItemId.values()) {
    const duplicateIndex = deduplicated.findIndex((candidate) => isConservativeDuplicate(candidate, offer));
    if (duplicateIndex === -1) {
      deduplicated.push(offer);
    } else {
      deduplicated[duplicateIndex] = preferredOffer(deduplicated[duplicateIndex], offer);
    }
  }

  return deduplicated.sort((left, right) => (
    informationScore(right) - informationScore(left)
    || left.salePrice - right.salePrice
    || left.itemId.localeCompare(right.itemId)
  ));
}
