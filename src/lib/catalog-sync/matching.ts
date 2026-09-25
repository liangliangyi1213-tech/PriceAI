import type { Product } from "@/types/catalog";

import { compactText } from "./normalize";
import type { NormalizedPlatformProduct } from "./types";
import { matchPhoneCatalogProductIdentity } from "@/lib/search/catalog-query-match";
import {
  matchVariantEvidence,
  type ProductMatchResult,
  type VariantMatchResult,
} from "@/lib/matching/evidence";

export type MatchOutcome =
  | { status: "matched"; product: Product; variant: Product["variants"][number]; productMatch: Extract<ProductMatchResult, { status: "matched" }>; variantMatch: Extract<VariantMatchResult, { status: "matched" }> }
  | { status: "unmatched" | "insufficient_evidence" | "conflict"; productMatch: ProductMatchResult; variantMatch: VariantMatchResult }
  | { status: "ambiguous"; productMatch: ProductMatchResult; variantMatch: VariantMatchResult };

function evidenceConflicts(input: NormalizedPlatformProduct): boolean {
  if (input.titleVariantConflict) return true;
  const structured = input.structuredVariantEvidence?.attributes ?? {};
  const title = input.titleVariantEvidence.attributes;
  return Object.entries(structured).some(([key, value]) => {
    const titleValue = title[key as keyof typeof title];
    return typeof titleValue === "string" && compactText(titleValue) !== compactText(value);
  });
}

export function matchPhoneProduct(input: NormalizedPlatformProduct, products: Product[]): MatchOutcome {
  const noProduct: ProductMatchResult = { status: "not_matched", evidenceSource: "title_only", productId: null };
  const noVariant: VariantMatchResult = { status: "insufficient_evidence", evidenceSource: "none", variantId: null };
  if (!input.brand) return { status: "unmatched", productMatch: noProduct, variantMatch: noVariant };
  const inputBrand = input.brand;
  const haystack = compactText(`${input.title} ${input.externalProductId}`);
  const productIdentityTitle = input.title.replace(/\d+\s*(?:gb|g|tb|t)\b/gi, " ");
  const assessedProducts = products.map((product) => {
    const productBrand = compactText(product.brand);
    const brandMatches = productBrand === compactText(inputBrand) || (inputBrand === "Apple" && productBrand === "apple");
    const productMatch = matchPhoneCatalogProductIdentity(product, productIdentityTitle);
    return { product, productMatch, eligible: brandMatches && haystack.includes(compactText(product.name)) };
  });
  const candidates = assessedProducts.filter((candidate) => candidate.eligible && candidate.productMatch.status === "matched");
  if (!candidates.length && assessedProducts.some((candidate) => candidate.eligible && candidate.productMatch.status === "ambiguous")) {
    return {
      status: "ambiguous",
      productMatch: { status: "ambiguous", evidenceSource: "title_only", productId: null },
      variantMatch: noVariant,
    };
  }
  if (!candidates.length) return { status: "unmatched", productMatch: noProduct, variantMatch: noVariant };
  const longest = Math.max(...candidates.map(({ product }) => compactText(product.name).length));
  const bestProducts = candidates.filter(({ product }) => compactText(product.name).length === longest);
  if (bestProducts.length !== 1) {
    return {
      status: "ambiguous",
      productMatch: { status: "ambiguous", evidenceSource: "title_only", productId: null },
      variantMatch: noVariant,
    };
  }
  const { product, productMatch } = bestProducts[0];
  if (productMatch.status !== "matched") {
    return { status: "unmatched", productMatch: noProduct, variantMatch: noVariant };
  }
  if (evidenceConflicts(input)) {
    return {
      status: "conflict",
      productMatch,
      variantMatch: { status: "conflict", evidenceSource: "structured", variantId: null },
    };
  }
  const variantMatch = matchVariantEvidence(
    product.variants,
    input.structuredVariantEvidence ?? input.titleVariantEvidence,
  );
  if (variantMatch.status !== "matched") {
    return { status: variantMatch.status === "not_matched" ? "unmatched" : variantMatch.status, productMatch, variantMatch };
  }
  const variant = product.variants.find((candidate) => candidate.id === variantMatch.variantId);
  if (!variant) return { status: "conflict", productMatch, variantMatch: { status: "conflict", evidenceSource: "structured", variantId: null } };
  return { status: "matched", product, variant, productMatch, variantMatch };
}
