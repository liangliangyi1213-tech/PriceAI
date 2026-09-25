import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";

import { canParticipateInComparablePrice, matchVariantEvidence } from "./evidence";

const variants = phones.find((product) => product.slug === "apple-iphone-16")!.variants;

describe("variant evidence firewall", () => {
  it("never treats an exact title-only attribute match as comparable", () => {
    const result = matchVariantEvidence(variants, {
      source: "title_only",
      attributes: { storage: "256GB", color: "黑色", region: "国行", condition: "全新" },
    });

    expect(result).toEqual({
      status: "insufficient_evidence",
      evidenceSource: "title_only",
      variantId: null,
    });
    expect(canParticipateInComparablePrice({ variantId: null, variantMatch: result }, variants[0].id)).toBe(false);
  });

  it("allows a unique conflict-free structured variant match to be comparable", () => {
    const result = matchVariantEvidence(variants, {
      source: "structured",
      attributes: { storage: "256GB", color: "黑色", region: "国行", condition: "全新" },
    });

    expect(result).toEqual({
      status: "matched",
      evidenceSource: "structured",
      variantId: variants[0].id,
    });
    expect(canParticipateInComparablePrice({ variantId: variants[0].id, variantMatch: result }, variants[0].id)).toBe(true);
  });

  it("rejects conflicting structured evidence instead of choosing a variant", () => {
    const result = matchVariantEvidence(variants, {
      source: "structured",
      attributes: { storage: "128GB", color: "黑色" },
    });

    expect(result).toEqual({
      status: "conflict",
      evidenceSource: "structured",
      variantId: null,
    });
    expect(canParticipateInComparablePrice({ variantId: null, variantMatch: result }, variants[0].id)).toBe(false);
  });
});
