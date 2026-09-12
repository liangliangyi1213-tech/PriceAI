import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { phones } from "@/data/phones";
import type { PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import type { LiveTaobaoOffer } from "@/lib/platforms/taobao-client";

import { createCatalogImageCandidate } from "./candidate-service";
import type { CatalogImageCandidateRepository } from "./candidate-service";

const product = phones.find((item) => item.slug === "xiaomi-15")!;
const variant = product.variants[0];

function taobaoOffer(overrides: Partial<LiveTaobaoOffer> = {}): LiveTaobaoOffer {
  return {
    itemId: "tb-xiaomi-15",
    title: "小米15 全新国行手机",
    shortTitle: "小米15",
    brandName: "小米",
    categoryId: "1512",
    categoryName: "手机",
    shopTitle: "测试店铺",
    sellerId: "seller-1",
    pictUrl: "https://img.alicdn.com/xiaomi-15-main.jpg",
    smallImages: ["https://img.alicdn.com/xiaomi-15-small.jpg"],
    reservePrice: 4499,
    salePrice: 4299,
    promotionPrice: null,
    promotionTagList: [],
    govSubsidy: null,
    annualVol: 100,
    totalSales: 50,
    clickUrl: "https://s.click.taobao.com/example",
    variantId: null,
    ...overrides,
  };
}

function pinduoduoGoods(overrides: Partial<PinduoduoGoods> = {}): PinduoduoGoods {
  return {
    goodsId: "pdd-xiaomi-15",
    goodsSign: "goods-sign",
    goodsName: "小米15 12GB 256GB 黑色 国行手机",
    goodsThumbnailUrl: "https://img.pddpic.com/xiaomi-15-thumb.jpg",
    goodsImageUrl: "https://img.pddpic.com/xiaomi-15-main.jpg",
    categoryName: "手机",
    mallName: "测试商城",
    merchantType: 1,
    salesTip: "100+",
    realtimeSalesTip: null,
    hasCoupon: false,
    couponPrice: null,
    couponMinOrderAmount: null,
    minNormalPrice: 4099,
    promotionRate: null,
    fetchedAt: new Date("2026-09-12T00:00:00.000Z"),
    ...overrides,
  };
}

describe("catalog image candidate service", () => {
  const createCandidateIfAbsent = vi.fn();
  const repository: CatalogImageCandidateRepository = { createCandidateIfAbsent };

  beforeEach(() => {
    vi.clearAllMocks();
    createCandidateIfAbsent.mockResolvedValue({ status: "created", imageId: "image-1" });
  });

  it("creates a product candidate only for a matched Taobao product and prefers pict_url", async () => {
    const result = await createCatalogImageCandidate({
      source: { platform: "taobao", listing: taobaoOffer() },
      match: {
        status: "matched",
        product,
        matchConfidence: 0.98,
        evidence: { matcher: "taobao_phone_strict", signals: ["brand", "model"] },
      },
    }, repository);

    expect(result).toEqual({ status: "created", imageId: "image-1" });
    expect(createCandidateIfAbsent).toHaveBeenCalledWith({
      productId: product.id,
      variantId: null,
      targetType: "product",
      platform: "taobao",
      externalProductId: "tb-xiaomi-15",
      externalVariantId: null,
      sourceKind: "pict_url",
      sourceUrl: "https://img.alicdn.com/xiaomi-15-main.jpg",
      matchConfidence: 0.98,
      matchEvidence: {
        schemaVersion: 1,
        matcher: "taobao_phone_strict",
        matchLevel: "product",
        signals: ["brand", "model"],
      },
    });
  });

  it("falls back to Taobao small_images[0] without inventing a variant", async () => {
    await createCatalogImageCandidate({
      source: { platform: "taobao", listing: taobaoOffer({ pictUrl: null }) },
      match: {
        status: "matched", product, matchConfidence: 0.95,
        evidence: { matcher: "taobao_phone_strict", signals: ["brand", "model"] },
      },
    }, repository);

    expect(createCandidateIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "product",
      variantId: null,
      sourceKind: "small_images_0",
      sourceUrl: "https://img.alicdn.com/xiaomi-15-small.jpg",
    }));
  });

  it.each(["ambiguous", "rejected", "unmatched"] as const)(
    "does not create a candidate for a %s platform match",
    async (status) => {
      await expect(createCatalogImageCandidate({
        source: { platform: "taobao", listing: taobaoOffer() },
        match: { status },
      }, repository)).resolves.toEqual({ status: "skipped", reason: status });
      expect(createCandidateIfAbsent).not.toHaveBeenCalled();
    },
  );

  it("creates a variant candidate only when the Variant match is explicit", async () => {
    await createCatalogImageCandidate({
      source: { platform: "pinduoduo", listing: pinduoduoGoods() },
      match: {
        status: "matched",
        product,
        variant,
        matchConfidence: 0.93,
        evidence: { matcher: "pinduoduo_phone_strict", signals: ["brand", "model", "storage", "color"] },
      },
    }, repository);

    expect(createCandidateIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      productId: product.id,
      variantId: variant.id,
      targetType: "variant",
      platform: "pdd",
      externalProductId: "pdd-xiaomi-15",
      externalVariantId: null,
      sourceKind: "goods_image_url",
      sourceUrl: "https://img.pddpic.com/xiaomi-15-main.jpg",
      matchEvidence: expect.objectContaining({ matchLevel: "variant" }),
    }));
  });

  it("keeps a matched PDD listing at product level when no Variant match exists", async () => {
    await createCatalogImageCandidate({
      source: { platform: "pinduoduo", listing: pinduoduoGoods({ goodsImageUrl: null }) },
      match: {
        status: "matched",
        product,
        matchConfidence: 0.9,
        evidence: { matcher: "pinduoduo_phone_strict", signals: ["brand", "model"] },
      },
    }, repository);

    expect(createCandidateIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      variantId: null,
      targetType: "product",
      sourceKind: "goods_thumbnail_url",
      sourceUrl: "https://img.pddpic.com/xiaomi-15-thumb.jpg",
    }));
  });

  it.each([
    "http://img.alicdn.com/insecure.jpg",
    "https://untrusted.example/image.jpg",
  ])("rejects an unsafe provider image URL: %s", async (sourceUrl) => {
    const result = await createCatalogImageCandidate({
      source: {
        platform: "taobao",
        listing: taobaoOffer({ pictUrl: sourceUrl, smallImages: [] }),
      },
      match: {
        status: "matched", product, matchConfidence: 0.98,
        evidence: { matcher: "taobao_phone_strict", signals: ["brand", "model"] },
      },
    }, repository);

    expect(result).toEqual({ status: "skipped", reason: "invalid_image" });
    expect(createCandidateIfAbsent).not.toHaveBeenCalled();
  });

  it("returns the repository duplicate result without attempting approval", async () => {
    createCandidateIfAbsent.mockResolvedValue({ status: "duplicate", imageId: "image-existing" });

    await expect(createCatalogImageCandidate({
      source: { platform: "taobao", listing: taobaoOffer() },
      match: {
        status: "matched", product, matchConfidence: 0.98,
        evidence: { matcher: "taobao_phone_strict", signals: ["brand", "model"] },
      },
    }, repository)).resolves.toEqual({ status: "duplicate", imageId: "image-existing" });
    expect(createCandidateIfAbsent).toHaveBeenCalledTimes(1);
  });

  it("does not mutate the legacy Catalog product image", async () => {
    const legacyImage = product.image;
    await createCatalogImageCandidate({
      source: { platform: "taobao", listing: taobaoOffer() },
      match: {
        status: "matched", product, matchConfidence: 0.98,
        evidence: { matcher: "taobao_phone_strict", signals: ["brand", "model"] },
      },
    }, repository);

    expect(product.image).toBe(legacyImage);
  });

  it("rejects a Variant target that does not belong to the matched Product", async () => {
    await expect(createCatalogImageCandidate({
      source: { platform: "pinduoduo", listing: pinduoduoGoods() },
      match: {
        status: "matched",
        product,
        variant: { ...variant, productId: "another-product" },
        matchConfidence: 0.93,
        evidence: { matcher: "pinduoduo_phone_strict", signals: ["brand", "model", "storage"] },
      },
    }, repository)).resolves.toEqual({ status: "skipped", reason: "invalid_target" });
    expect(createCandidateIfAbsent).not.toHaveBeenCalled();
  });
});
