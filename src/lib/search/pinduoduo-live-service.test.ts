import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { phones } from "@/data/phones";
import type { PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import { createLivePinduoduoService, type PinduoduoGoodsCache } from "./pinduoduo-live-service";

const product = phones.find((item) => item.slug === "apple-iphone-16")!;
const goods: PinduoduoGoods = {
  goodsId: "123", goodsSign: "private-product-sign", goodsName: "Apple iPhone16 256GB 黑色 手机",
  goodsThumbnailUrl: null, goodsImageUrl: "https://example.com/phone.jpg", categoryName: "手机",
  mallName: "品牌商城", merchantType: 1, salesTip: "1.2万+", realtimeSalesTip: null,
  hasCoupon: false, couponPrice: null, couponMinOrderAmount: null, minNormalPrice: 5000,
  promotionRate: 20, fetchedAt: new Date("2026-09-05T00:00:00Z"),
};
const response = (items = [goods]) => ({ total: items.length, goods: items });
const clientFixture = () => ({ searchGoods: vi.fn().mockResolvedValue(response()), getRecommendedGoods: vi.fn().mockResolvedValue(response()) });

afterEach(() => vi.unstubAllEnvs());

describe("live Pinduoduo service", () => {
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
    expect(client.searchGoods).toHaveBeenCalledWith("iphone16", { limit: 100 }, { signal: expect.any(AbortSignal) });
    expect(client.getRecommendedGoods).not.toHaveBeenCalled();
    expect(product).toEqual(before);
  });

  it("uses the recommendation pool only after an empty search", async () => {
    const client = clientFixture();
    client.searchGoods.mockResolvedValue(response([]));
    const result = await createLivePinduoduoService({ client })([product], "iphone16");
    expect(result.get(product.id)?.[0].goodsId).toBe("123");
    expect(client.getRecommendedGoods).toHaveBeenCalledWith({ limit: 400 }, { signal: expect.any(AbortSignal) });
    expect(client.searchGoods.mock.invocationCallOrder[0]).toBeLessThan(client.getRecommendedGoods.mock.invocationCallOrder[0]);
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

  it("returns empty for nonqualifying search goods without consulting recommendations", async () => {
    const client = clientFixture();
    client.searchGoods.mockResolvedValue(response([{ ...goods, goodsName: "iPhone16 手机壳" }]));
    expect(await createLivePinduoduoService({ client })([product], "iphone16")).toEqual(new Map());
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
