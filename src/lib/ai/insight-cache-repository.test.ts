import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/client", () => ({ getSupabase: () => ({ from }) }));

import { getProductInsightCacheRepository } from "./insight-cache-repository";

const key = { productId: "p1", variantId: "v1", factsHash: "a".repeat(64) };

describe("ProductInsight cache repository", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("maps a matching Supabase cache row without a real database call", async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: { insight: { verdict: "缓存" } }, error: null }));
    const eqFactsHash = vi.fn(() => ({ maybeSingle }));
    const eqVariant = vi.fn(() => ({ eq: eqFactsHash }));
    const eqProduct = vi.fn(() => ({ eq: eqVariant }));
    from.mockReturnValue({ select: vi.fn(() => ({ eq: eqProduct })) });

    await expect(getProductInsightCacheRepository().get(key)).resolves.toEqual({ verdict: "缓存" });
  });

  it("uses conflict-safe upsert options for concurrent cache writers", async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockReturnValue({ upsert });

    await expect(
      getProductInsightCacheRepository().upsert({
        ...key,
        insight: {
          verdict: "建议",
          pros: [],
          cons: [],
          suitableFor: [],
          notSuitableFor: [],
          buyingAdvice: "确认规格后购买。",
        },
        model: "gpt-5-mini",
      }),
    ).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: "p1", variant_id: "v1", facts_hash: key.factsHash }),
      { onConflict: "product_id,variant_id,facts_hash", ignoreDuplicates: true },
    );
  });
});
