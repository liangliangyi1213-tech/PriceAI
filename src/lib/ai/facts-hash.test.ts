import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";

import { buildProductFacts } from "./product-insight";
import { hashProductFacts } from "./facts-hash";

describe("ProductFacts hash", () => {
  const facts = buildProductFacts(phones[0], phones[0].variants[0]);

  it("returns the same SHA-256 hash for equivalent facts with a different object key order", () => {
    const equivalentFacts = {
      ...facts,
      specs: Object.fromEntries(Object.entries(facts.specs).reverse()),
    };

    expect(hashProductFacts(equivalentFacts)).toBe(hashProductFacts(facts));
  });

  it("changes when a platform offer price changes", () => {
    const changedPriceFacts = {
      ...facts,
      offers: facts.offers.map((offer, index) => (index === 0 ? { ...offer, price: offer.price + 1 } : offer)),
    };

    expect(hashProductFacts(changedPriceFacts)).not.toBe(hashProductFacts(facts));
  });

  it("changes when the programmatic value score changes", () => {
    expect(hashProductFacts({ ...facts, valueScore: (facts.valueScore ?? 0) + 1 })).not.toBe(hashProductFacts(facts));
  });

  it("changes when the facts provenance changes without changing the numeric facts", () => {
    const verifiedProduct = structuredClone(phones[0]);
    verifiedProduct.variants[0].offers = verifiedProduct.variants[0].offers.map((offer) => ({
      ...offer,
      source: "verified_platform",
    }));
    const verifiedFacts = buildProductFacts(verifiedProduct, verifiedProduct.variants[0]);

    expect(verifiedFacts.lowestPrice).toBe(facts.lowestPrice);
    expect(verifiedFacts.valueScore).toBe(facts.valueScore);
    expect(hashProductFacts(verifiedFacts)).not.toBe(hashProductFacts(facts));
  });
});
