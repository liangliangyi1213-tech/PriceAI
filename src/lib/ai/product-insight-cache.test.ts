import { describe, expect, it, vi } from "vitest";

import { phones } from "@/data/phones";

import { buildProductFacts, fallbackInsight, getProductInsight } from "./product-insight";
import type { ProductInsight } from "./types";

const cachedInsight: ProductInsight = {
  verdict: "缓存建议",
  pros: ["缓存优点"],
  cons: ["缓存缺点"],
  suitableFor: ["缓存用户"],
  notSuitableFor: ["缓存外用户"],
  buyingAdvice: "缓存购买建议",
};

const product = phones[0];
const variant = product.variants[0];

function cache(overrides: Partial<{ get: () => Promise<unknown>; upsert: () => Promise<void> }> = {}) {
  return {
    get: vi.fn(overrides.get ?? (() => Promise.resolve(null))),
    upsert: vi.fn(overrides.upsert ?? (() => Promise.resolve())),
  };
}

describe("ProductInsight cache service", () => {
  it("returns a cache hit without calling OpenAI", async () => {
    const insightCache = cache({ get: () => Promise.resolve(cachedInsight) });
    const generate = vi.fn(() => Promise.resolve(cachedInsight));

    const insight = await getProductInsight(product, variant, { cache: insightCache, generate });

    expect(insight).toEqual(cachedInsight);
    expect(generate).not.toHaveBeenCalled();
  });

  it("generates and persists an insight on a cache miss", async () => {
    const insightCache = cache();
    const generate = vi.fn(() => Promise.resolve(cachedInsight));

    const insight = await getProductInsight(product, variant, { cache: insightCache, generate });

    expect(insight).toEqual(cachedInsight);
    expect(generate).toHaveBeenCalledOnce();
    expect(insightCache.upsert).toHaveBeenCalledOnce();
  });

  it("continues with AI generation when cache reading fails", async () => {
    const insightCache = cache({ get: () => Promise.reject(new Error("read unavailable")) });
    const generate = vi.fn(() => Promise.resolve(cachedInsight));

    await expect(getProductInsight(product, variant, { cache: insightCache, generate })).resolves.toEqual(cachedInsight);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("uses fallback without writing a normal cache entry when AI generation fails", async () => {
    const insightCache = cache();
    const generate = vi.fn(() => Promise.resolve(null));

    const insight = await getProductInsight(product, variant, { cache: insightCache, generate });

    expect(insight).toEqual(fallbackInsight(buildProductFacts(product, variant)));
    expect(insightCache.upsert).not.toHaveBeenCalled();
  });

  it("returns an AI insight even when cache persistence fails", async () => {
    const insightCache = cache({ upsert: () => Promise.reject(new Error("write unavailable")) });
    const generate = vi.fn(() => Promise.resolve(cachedInsight));

    await expect(getProductInsight(product, variant, { cache: insightCache, generate })).resolves.toEqual(cachedInsight);
  });

  it("handles concurrent duplicate upserts without an unhandled exception", async () => {
    const insightCache = cache();
    const generate = vi.fn(() => Promise.resolve(cachedInsight));

    await expect(
      Promise.all([
        getProductInsight(product, variant, { cache: insightCache, generate }),
        getProductInsight(product, variant, { cache: insightCache, generate }),
      ]),
    ).resolves.toEqual([cachedInsight, cachedInsight]);
  });
});
