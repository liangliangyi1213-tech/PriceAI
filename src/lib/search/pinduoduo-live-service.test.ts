import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { phones } from "@/data/phones";
import type { PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import { createLivePinduoduoService, type PinduoduoGoodsCache } from "./pinduoduo-live-service";

const product = phones.find((item) => item.slug === "apple-iphone-16")!;
const iphone16Pro = phones.find((item) => item.slug === "apple-iphone-16-pro")!;
const pura70 = phones.find((item) => item.slug === "huawei-pura-70")!;
const xiaomi15 = phones.find((item) => item.slug === "xiaomi-15")!;
const goods: PinduoduoGoods = {
  goodsId: "123", goodsSign: "private-product-sign", goodsName: "Apple iPhone16 256GB 黑色 手机",
  goodsThumbnailUrl: null, goodsImageUrl: "https://example.com/phone.jpg", categoryName: "手机",
  mallName: "品牌商城", merchantType: 1, salesTip: "1.2万+", realtimeSalesTip: null,
  hasCoupon: false, couponPrice: null, couponMinOrderAmount: null, minNormalPrice: 5000,
  promotionRate: 20, fetchedAt: new Date("2026-09-05T00:00:00Z"),
};
const emptyParseDiagnostics = { missingGoodsIdCount: 0, missingNameCount: 0, missingMallNameCount: 0, missingNormalPriceCount: 0, missingGroupPriceCount: 0, noComparablePriceCount: 0 };
const response = (items = [goods]) => ({ total: items.length, rawCount: items.length, parseDiagnostics: emptyParseDiagnostics, goods: items });
const clientFixture = () => ({ searchGoods: vi.fn().mockResolvedValue(response()), getRecommendedGoods: vi.fn().mockResolvedValue(response()) });

afterEach(() => vi.unstubAllEnvs());

describe("live Pinduoduo service", () => {
  it.each([
    { query: "iPhone 16 Pro", target: iphone16Pro, goodsName: "Apple iPhone 16 Pro 全新手机", productKey: "iphone-16-pro" },
    { query: "小米 15", target: xiaomi15, goodsName: "小米 15 全新手机", productKey: "xiaomi-15" },
  ])("runs the bounded SKU capability diagnostic for $productKey", async ({ query, target, goodsName, productKey }) => {
    vi.stubEnv("PDD_SKU_DIAGNOSTIC_ENABLED", "1");
    const candidates = [1, 2, 3].map((index) => ({
      ...goods, goodsId: `${productKey}-${index}`, goodsSign: `private-sign-${index}`,
      goodsName, minNormalPrice: 3999 + index,
    }));
    const client = {
      ...clientFixture(),
      searchGoods: vi.fn().mockResolvedValue({ ...response(candidates), searchId: "private-search-id" }),
      getGoodsDetailCapabilities: vi.fn().mockResolvedValue({
        success: true, skuPermissionStatus: "not_returned", skuCount: 0,
        skuWithAttributeNameCount: 0, skuWithAttributeValueCount: 0, skuWithPriceCount: 0,
        hasCapacity: false, hasColor: false, hasRegionOrVersion: false, hasCondition: false,
      }),
    };
    const events: unknown[] = [];

    await createLivePinduoduoService({ client, diagnostic: (event) => events.push(event) })([target], query);

    expect(client.getGoodsDetailCapabilities).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual(expect.objectContaining({
      event: "sku_detail_diagnostic", productKey, candidateIndex: 1,
    }));
    expect(JSON.stringify(events)).not.toMatch(/private|goodsSign|searchId|goodsId|goodsName/);
  });

  it("diagnoses at most two product-level Pura 70 candidates without exposing private identifiers", async () => {
    vi.stubEnv("PDD_SKU_DIAGNOSTIC_ENABLED", "1");
    const candidates = [1, 2, 3].map((index) => ({
      ...goods, goodsId: String(index), goodsSign: `private-sign-${index}`,
      goodsName: "华为 Pura 70 全新手机", minNormalPrice: 4699 + index,
    }));
    const client = {
      ...clientFixture(),
      searchGoods: vi.fn().mockResolvedValue({ ...response(candidates), searchId: "private-search-id" }),
      getGoodsDetailCapabilities: vi.fn().mockResolvedValue({
        success: true, skuPermissionStatus: "available", skuCount: 4,
        skuWithAttributeNameCount: 4, skuWithAttributeValueCount: 4, skuWithPriceCount: 4,
        hasCapacity: true, hasColor: true, hasRegionOrVersion: false, hasCondition: false,
      }),
    };
    const events: unknown[] = [];

    await createLivePinduoduoService({ client, diagnostic: (event) => events.push(event) })([pura70], "Pura 70");

    expect(client.getGoodsDetailCapabilities).toHaveBeenCalledTimes(2);
    expect(client.getGoodsDetailCapabilities).toHaveBeenNthCalledWith(1, {
      goodsSign: "private-sign-1", searchId: "private-search-id",
    }, { signal: expect.any(AbortSignal) });
    expect(events).toContainEqual(expect.objectContaining({
      event: "sku_detail_diagnostic", productKey: "pura-70", candidateIndex: 1,
      success: true, skuPermissionStatus: "available", skuCount: 4,
      hasCapacity: true, hasColor: true, hasRegionOrVersion: false, hasCondition: false,
    }));
    expect(JSON.stringify(events)).not.toMatch(/private|goodsSign|searchId|goodsId|华为|4699/);
  });

  it("keeps search results unchanged when the optional SKU diagnostic fails", async () => {
    vi.stubEnv("PDD_SKU_DIAGNOSTIC_ENABLED", "1");
    const candidate = { ...goods, goodsName: "华为 Pura 70 256GB 黑色 国行 全新手机", goodsSign: "private-sign" };
    const client = {
      ...clientFixture(),
      searchGoods: vi.fn().mockResolvedValue({ ...response([candidate]), searchId: "private-search-id" }),
      getGoodsDetailCapabilities: vi.fn().mockRejectedValue(Object.assign(new Error("private"), {
        providerCode: 50001, providerSubCode: "permission.denied",
        providerSubMessage: "sku权限不足 goods_sign=private-sign", providerRequestId: "private-request",
      })),
    };
    const events: unknown[] = [];

    const result = await createLivePinduoduoService({ client, diagnostic: (event) => events.push(event) })([pura70], "Pura 70");

    expect(result.get(pura70.id)).toHaveLength(1);
    expect(events).toContainEqual(expect.objectContaining({
      event: "sku_detail_diagnostic", candidateIndex: 1, success: false,
      errorCode: 50001, subCode: "permission.denied",
    }));
    expect(JSON.stringify(events)).not.toMatch(/private-sign|private-search|private-request/);
  });
  it.each(["", "  \t\n "])("does not request goods for a blank query", async (query) => {
    const client = clientFixture();
    expect(await createLivePinduoduoService({ client })([product], query)).toEqual(new Map());
    expect(client.searchGoods).not.toHaveBeenCalled();
    expect(client.getRecommendedGoods).not.toHaveBeenCalled();
  });

  it("selects search results and skips recommendations without mutating the catalog", async () => {
    const client = clientFixture();
    const before = structuredClone(product);
    const result = await createLivePinduoduoService({ client })([product], "iphone16");
    expect(result.get(product.id)).toEqual([expect.objectContaining({ goodsId: "123", price: 5000, source: "live" })]);
    expect(client.searchGoods).toHaveBeenCalledWith("iphone16", { limit: 100, page: 1 }, { signal: expect.any(AbortSignal) });
    expect(client.getRecommendedGoods).not.toHaveBeenCalled();
    expect(product).toEqual(before);
  });

  it("runs aggregate A/B/C/D diagnostics behind a server-only experiment flag", async () => {
    vi.stubEnv("PDD_RECALL_EXPERIMENT", "1");
    const client = {
      ...clientFixture(),
      getGoodsOptChildren: vi.fn().mockResolvedValue([{ id: 321, name: "手机", parentId: 0, level: 1 }]),
      getGoodsCategoryChildren: vi.fn().mockResolvedValue([{ id: 654, name: "手机", parentId: 0, level: 1 }]),
    };
    const events: unknown[] = [];
    await createLivePinduoduoService({ client, diagnostic: (event) => events.push(event), timeoutMs: 1000 })([product], "iphone16");
    expect(events).toContainEqual(expect.objectContaining({
      event: "recall_experiment",
      categories: { opt: { id: 321, name: "手机", level: 1 }, category: { id: 654, name: "手机", level: 1 } },
      variants: expect.objectContaining({
        A: expect.objectContaining({ success: true, strictMatchCount: 1 }),
        B: expect.objectContaining({ success: true, strictMatchCount: 1 }),
        C: expect.objectContaining({ success: true, strictMatchCount: 1 }),
        D: expect.objectContaining({ success: true, strictMatchCount: 1 }),
      }),
    }));
    expect(client.searchGoods).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(events)).not.toMatch(/iphone16|Apple|品牌商城|private-product-sign/i);
  });

  it("uses the recommendation pool only after an empty search", async () => {
    const client = clientFixture();
    client.searchGoods.mockResolvedValue(response([]));
    const result = await createLivePinduoduoService({ client })([product], "iphone16");
    expect(result.get(product.id)?.[0].goodsId).toBe("123");
    expect(client.getRecommendedGoods).toHaveBeenCalledWith({ limit: 50 }, { signal: expect.any(AbortSignal) });
    expect(client.searchGoods.mock.invocationCallOrder[0]).toBeLessThan(client.getRecommendedGoods.mock.invocationCallOrder[0]);
  });

  it("emits safe response and selection diagnostics for recommendation fallback", async () => {
    const client = clientFixture();
    client.searchGoods.mockResolvedValue(response([]));
    const events: unknown[] = [];
    await createLivePinduoduoService({ client, diagnostic: (event) => events.push(event) })([product], "iphone16");
    expect(events).toEqual([
      { event: "api_response", method: "pdd.ddk.goods.search", success: true, providerTotal: 0, rawCount: 0, parsedCount: 0, ...emptyParseDiagnostics },
      { event: "api_response", method: "pdd.ddk.goods.recommend.get", success: true, providerTotal: 1, rawCount: 1, parsedCount: 1, ...emptyParseDiagnostics },
      { event: "selection", source: "recommend", inputCount: 1, candidatePairCount: 1, uniqueAccessoryGoodsCount: 0, accessoryPairCount: 0, unrelatedPairCount: 0, accessoryKeywordPairCount: 0, nonRetailModelPairCount: 0, replacementPartPairCount: 0, modelMismatchPairCount: 0, suffixMismatchPairCount: 0, queryMismatchPairCount: 0, missingPhoneEvidencePairCount: 0, emptyQueryPairCount: 0, invalidPriceCount: 0, invalidIdentityCount: 0, eligibleCount: 1, deduplicatedCount: 1, selectedCount: 1, matchedProductCount: 1, matchedVariantCount: 1, variantStorageMismatchCount: 0, variantColorMismatchCount: 0, variantRegionMismatchCount: 0, variantConditionMismatchCount: 0, variantInsufficientEvidenceCount: 0, variantAmbiguousMatchCount: 0 },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/iphone|123|品牌商城|private/i);
  });

  it("emits only safe provider error diagnostics on failure", async () => {
    const client = clientFixture();
    client.searchGoods.mockRejectedValue(Object.assign(new Error("private request"), {
      providerCode: 50001,
      providerSubCode: 60001,
      providerSubMessage: "缺少备案参数 pid=[REDACTED]",
      providerRequestId: "request-123",
    }));
    const events: unknown[] = [];
    await createLivePinduoduoService({ client, diagnostic: (event) => events.push(event) })([product], "iphone16");
    expect(events).toEqual([{
      event: "api_response",
      method: "pdd.ddk.goods.search",
      success: false,
      errorCode: 50001,
      subCode: 60001,
      subMessage: "缺少备案参数 pid=[REDACTED]",
      requestId: "request-123",
    }]);
    expect(JSON.stringify(events)).not.toContain("private request");
  });

  it("returns empty for missing environment configuration", async () => {
    vi.stubEnv("PDD_CLIENT_ID", "");
    vi.stubEnv("PDD_CLIENT_SECRET", "");
    vi.stubEnv("PDD_PID", "");
    expect(await createLivePinduoduoService()([product], "iphone16")).toEqual(new Map());
  });

  it("returns empty after an API rejection and never logs request material", async () => {
    const client = clientFixture();
    client.searchGoods.mockRejectedValue(new Error("private request"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await createLivePinduoduoService({ client })([product], "iphone16")).toEqual(new Map());
      expect(client.getRecommendedGoods).not.toHaveBeenCalled();
      expect(warn.mock.calls.flat().join(" ")).not.toContain("private request");
    } finally { warn.mockRestore(); }
  });

  it("returns the catalog fallback when the upstream sequence exceeds its deadline", async () => {
    const client = clientFixture();
    let signal: AbortSignal | undefined;
    client.searchGoods.mockImplementation((_query, _options, requestOptions) => {
      signal = requestOptions?.signal;
      return new Promise(() => {});
    });
    const service = createLivePinduoduoService({ client, timeoutMs: 5 });

    const startedAt = Date.now();
    expect(await service([product], "iphone16")).toEqual(new Map());
    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(signal?.aborted).toBe(true);
    expect(client.getRecommendedGoods).not.toHaveBeenCalled();
  });

  it("continues to a bounded next search page when the first page only contains accessories", async () => {
    const client = clientFixture();
    client.searchGoods
      .mockResolvedValueOnce(response([{ ...goods, goodsName: "iPhone16 手机壳" }]))
      .mockResolvedValueOnce(response([goods]));
    expect((await createLivePinduoduoService({ client })([product], "iphone16")).get(product.id)?.[0].goodsId).toBe("123");
    expect(client.searchGoods).toHaveBeenNthCalledWith(2, "iphone16", { limit: 100, page: 2 }, { signal: expect.any(AbortSignal) });
    expect(client.getRecommendedGoods).not.toHaveBeenCalled();
  });

  it("bounds accessory-only search pagination and returns the catalog fallback", async () => {
    const client = clientFixture();
    client.searchGoods.mockResolvedValue(response([{ ...goods, goodsName: "iPhone16 手机壳" }]));
    expect(await createLivePinduoduoService({ client })([product], "iphone16")).toEqual(new Map());
    expect(client.searchGoods).toHaveBeenCalledTimes(5);
    expect(client.getRecommendedGoods).not.toHaveBeenCalled();
  });

  it("reuses normalized queries while selecting against each caller's catalog", async () => {
    const client = clientFixture();
    const service = createLivePinduoduoService({ client });
    await service([product], "  IPHONE16  ");
    expect((await service([product], "ｉｐｈｏｎｅ１６")).get(product.id)?.[0].goodsId).toBe("123");
    expect(await service([], "iphone16")).toEqual(new Map());
    expect(client.searchGoods).toHaveBeenCalledTimes(1);
  });

  it("refreshes at the 600-second expiry boundary", async () => {
    const client = clientFixture();
    let now = 1000;
    const service = createLivePinduoduoService({ client, now: () => now });
    await service([product], "iphone16");
    now += 599999;
    await service([product], "iphone16");
    expect(client.searchGoods).toHaveBeenCalledTimes(1);
    now += 1;
    client.searchGoods.mockResolvedValue(response([{ ...goods, minNormalPrice: 4900 }]));
    expect((await service([product], "iphone16")).get(product.id)?.[0].price).toBe(4900);
    expect(client.searchGoods).toHaveBeenCalledTimes(2);
  });

  it.each(["search", "recommend"])("does not cache a failed %s request", async (failure) => {
    const client = clientFixture();
    if (failure === "search") client.searchGoods.mockRejectedValueOnce(new Error("private"));
    else {
      client.searchGoods.mockResolvedValue(response([]));
      client.getRecommendedGoods.mockRejectedValueOnce(new Error("private"));
    }
    const cache: PinduoduoGoodsCache = new Map();
    const service = createLivePinduoduoService({ client, cache });
    expect(await service([product], "iphone16")).toEqual(new Map());
    expect(cache.size).toBe(0);
    expect((await service([product], "iphone16")).get(product.id)?.[0].price).toBe(5000);
    expect(client.searchGoods).toHaveBeenCalledTimes(2);
  });

  it("bounds cache entries and retains only public goods fields", async () => {
    const client = clientFixture();
    client.searchGoods.mockResolvedValue({ ...response([{ ...goods, sign: "request-secret", rawResponse: "private" } as PinduoduoGoods]), rawResponse: "private" });
    const cache: PinduoduoGoodsCache = new Map();
    const service = createLivePinduoduoService({ client, cache, maxCacheEntries: 2 });
    await service([product], "iphone16");
    expect(JSON.stringify([...cache])).not.toMatch(/private|request-secret|rawResponse/);
    await service([product], "apple iphone16");
    await service([product], "iphone 16");
    expect(cache.size).toBe(2);
    await service([product], "iphone16");
    expect(client.searchGoods).toHaveBeenCalledTimes(4);
  });
});
