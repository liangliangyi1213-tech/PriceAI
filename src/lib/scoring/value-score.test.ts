import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";

import { scoreVariant } from "./value-score";

describe("scoreVariant provenance readiness", () => {
  it("keeps the existing explicitly labelled demonstration score available", () => {
    expect(scoreVariant(phones[0].variants[0]).total).toBe(68);
  });

  it("fails closed instead of turning an unknown Offer into a zero score", () => {
    const variant = structuredClone(phones[0].variants[0]);
    variant.offers = variant.offers.map((offer) => ({ ...offer, source: "unexpected" }));

    expect(scoreVariant(variant)).toEqual({
      total: null,
      reason: "暂无具备可信来源与完整事实的评分报价",
    });
  });

  it("allows a verified platform Offer only while every scoring fact is ready", () => {
    const variant = structuredClone(phones[0].variants[0]);
    variant.offers = [{ ...variant.offers[0], source: "verified_platform" }];
    expect(scoreVariant(variant).total).not.toBeNull();

    variant.offers[0].rating = Number.NaN;
    expect(scoreVariant(variant).total).toBeNull();
  });

  it("does not grant platform_sync an implicit scoring identity", () => {
    const variant = structuredClone(phones[0].variants[0]);
    variant.offers = [{ ...variant.offers[0], source: "platform_sync" }];

    expect(scoreVariant(variant).total).toBeNull();
  });
});
