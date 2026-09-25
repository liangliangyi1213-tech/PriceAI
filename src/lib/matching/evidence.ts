import type { ProductVariant } from "@/types/catalog";

export type MatchEvidenceSource = "structured" | "title_only" | "none";
export type MatchStatus = "matched" | "ambiguous" | "insufficient_evidence" | "conflict" | "not_matched";

export type ProductMatchResult =
  | Readonly<{ status: "matched"; evidenceSource: Exclude<MatchEvidenceSource, "none">; productId: string }>
  | Readonly<{ status: Exclude<MatchStatus, "matched">; evidenceSource: MatchEvidenceSource; productId: null }>;

export type VariantMatchResult =
  | Readonly<{ status: "matched"; evidenceSource: "structured"; variantId: string }>
  | Readonly<{ status: Exclude<MatchStatus, "matched">; evidenceSource: MatchEvidenceSource; variantId: null }>;

export type VariantEvidenceAttributes = Partial<Pick<ProductVariant, "storage" | "color" | "region" | "condition">>;

export type VariantEvidence = Readonly<{
  source: MatchEvidenceSource;
  attributes: VariantEvidenceAttributes;
}>;

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, "");
}

function suppliedAttributes(attributes: VariantEvidenceAttributes) {
  return Object.entries(attributes).filter((entry): entry is [keyof VariantEvidenceAttributes, string] =>
    typeof entry[1] === "string" && entry[1].trim().length > 0);
}

/**
 * Text may reject or diagnose a candidate, but only structured provider
 * evidence may positively establish a comparable Catalog Variant.
 */
export function matchVariantEvidence(
  variants: readonly ProductVariant[],
  evidence: VariantEvidence,
): VariantMatchResult {
  const attributes = suppliedAttributes(evidence.attributes);
  if (evidence.source === "none" || attributes.length === 0) {
    return { status: "insufficient_evidence", evidenceSource: evidence.source, variantId: null };
  }

  const matches = variants.filter((variant) => attributes.every(([key, value]) =>
    normalized(variant[key]) === normalized(value)));
  if (matches.length === 0) {
    return { status: "conflict", evidenceSource: evidence.source, variantId: null };
  }
  if (matches.length > 1) {
    return { status: "ambiguous", evidenceSource: evidence.source, variantId: null };
  }
  if (evidence.source !== "structured") {
    return { status: "insufficient_evidence", evidenceSource: evidence.source, variantId: null };
  }
  return { status: "matched", evidenceSource: "structured", variantId: matches[0].id };
}

export function isComparableVariantMatch(
  result: VariantMatchResult,
): result is Extract<VariantMatchResult, { status: "matched" }> {
  return result.status === "matched" && result.evidenceSource === "structured" && Boolean(result.variantId);
}

export function canParticipateInComparablePrice(
  candidate: Readonly<{ variantId: string | null; variantMatch: VariantMatchResult }>,
  expectedVariantId?: string | null,
): boolean {
  if (!isComparableVariantMatch(candidate.variantMatch) || candidate.variantId !== candidate.variantMatch.variantId) return false;
  return expectedVariantId === undefined || (expectedVariantId !== null && candidate.variantId === expectedVariantId);
}
