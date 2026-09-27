import { describe, expect, it } from "vitest";

import type { Offer } from "@/types/catalog";

import {
  canUseOfferFact,
  classifyOfferProvenance,
  type FactUsage,
} from "./provenance";

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "offer-1",
    variantId: "variant-1",
    platform: "京东",
    seller: "店铺",
    title: "商品",
    price: 100,
    rating: 4.8,
    sales: 100,
    shipping: "免运费",
    warranty: "全国联保",
    url: "https://example.test/item",
    updatedAt: "2026-09-25T00:00:00.000Z",
    matchConfidence: 1,
    ...overrides,
  };
}

describe("canonical Offer provenance", () => {
  it.each(["mock", "seed"])("classifies source=%s as demonstration", (source) => {
    expect(classifyOfferProvenance(offer({ source }))).toMatchObject({
      kind: source,
      trust: "demonstration",
      demonstration: true,
    });
  });

  it.each([
    ["京东", "jd", "品牌旗舰店", "官方正品"],
    ["淘宝", "tb", "官方旗舰店", "官方正品"],
    ["拼多多", "pdd", "百亿补贴", "正品补贴"],
  ])("recognizes the exact %s legacy SQL seed fingerprint", (platform, suffix, seller, title) => {
    const legacySeed = offer({
      id: `variant-1-${suffix}`,
      variantId: "variant-1",
      platform,
      seller,
      title,
      source: "catalog",
      url: "#",
    });

    expect(classifyOfferProvenance(legacySeed).kind).toBe("seed");
    expect(classifyOfferProvenance(offer({ source: "catalog", url: "#" })).kind).toBe("catalog");
  });

  it("does not mistake a future Catalog offer with a seed-shaped id for legacy seed data", () => {
    const similarIdentity = offer({
      id: "variant-1-jd",
      variantId: "variant-1",
      platform: "京东",
      seller: "真实商家",
      title: "真实商品记录",
      source: "catalog",
      url: "#",
    });

    expect(classifyOfferProvenance(similarIdentity).kind).toBe("catalog");
    expect(classifyOfferProvenance({ ...similarIdentity, source: "platform_sync", seller: "品牌旗舰店", title: "官方正品" }).kind)
      .toBe("platform_sync");
    expect(classifyOfferProvenance({ ...similarIdentity, source: "verified_platform", seller: "品牌旗舰店", title: "官方正品" }).kind)
      .toBe("verified_platform");
  });

  it("does not infer verified provenance from a catalog or platform name", () => {
    expect(classifyOfferProvenance(offer({ source: "catalog", platform: "京东" })).trust).toBe("recorded");
    expect(classifyOfferProvenance(offer({ source: "platform_sync", platform: "淘宝" })).trust).toBe("recorded");
    expect(classifyOfferProvenance(offer({ source: "unrecognized", platform: "拼多多" })).kind).toBe("unknown");
  });
});

describe("Offer fact usage policy", () => {
  const decisionUsages: FactUsage[] = ["sort", "filter", "score", "ai", "compare"];

  it("keeps demonstration facts available for the explicitly labelled demo experience", () => {
    const demo = offer({ source: "mock" });
    expect(decisionUsages.every((usage) => canUseOfferFact(demo, "price", usage))).toBe(true);
    expect(canUseOfferFact(demo, "rating", "score")).toBe(true);
    expect(canUseOfferFact(demo, "sales", "ai")).toBe(true);
  });

  it("allows a verified platform fact only when that field is ready", () => {
    const verified = offer({ source: "verified_platform" });
    expect(canUseOfferFact(verified, "rating", "score")).toBe(true);
    expect(canUseOfferFact({ ...verified, rating: Number.NaN }, "rating", "score")).toBe(false);
    expect(canUseOfferFact({ ...verified, warranty: "信息未提供" }, "warranty", "ai")).toBe(false);
  });

  it("keeps recorded catalog price comparable but rejects unverified rating and sales facts", () => {
    const catalog = offer({ source: "catalog" });
    expect(canUseOfferFact(catalog, "price", "sort")).toBe(true);
    expect(canUseOfferFact(catalog, "price", "filter")).toBe(true);
    expect(canUseOfferFact(catalog, "price", "compare")).toBe(true);
    expect(canUseOfferFact(catalog, "rating", "score")).toBe(false);
    expect(canUseOfferFact(catalog, "sales", "ai")).toBe(false);
  });

  it("fails closed for unknown provenance outside display", () => {
    const unknown = offer({ source: "something-new" });
    expect(canUseOfferFact(unknown, "price", "display")).toBe(true);
    expect(decisionUsages.every((usage) => !canUseOfferFact(unknown, "price", usage))).toBe(true);
  });
});
