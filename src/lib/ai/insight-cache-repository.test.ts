import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/client", () => ({ getSupabase: () => ({ from }) }));

import { getProductInsightCacheRepository } from "./insight-cache-repository";

const key = { productId: "p1", variantId: "v1", factsHash: "a".repeat(64) };

describe("ProductInsight cache repository", () => {
  beforeEach(() => {
    from.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function networkFailure(code: "ECONNRESET" | "ETIMEDOUT" | "UND_ERR_CONNECT_TIMEOUT") {
    return new TypeError("fetch failed", {
      cause: Object.assign(new Error("private transport detail https://secret.example/path"), { code }),
    });
  }

  const record = {
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
  };

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
      getProductInsightCacheRepository().upsert(record),
    ).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: "p1", variant_id: "v1", facts_hash: key.factsHash }),
      { onConflict: "product_id,variant_id,facts_hash", ignoreDuplicates: true },
    );
  });

  it("retries one ECONNRESET after 200ms and then succeeds", async () => {
    const upsert = vi.fn()
      .mockRejectedValueOnce(networkFailure("ECONNRESET"))
      .mockResolvedValueOnce({ error: null });
    from.mockReturnValue({ upsert });

    const result = getProductInsightCacheRepository().upsert(record);
    await vi.advanceTimersByTimeAsync(200);

    await expect(result).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("retries an UND_ERR_CONNECT_TIMEOUT and preserves conflict-safe identity", async () => {
    const upsert = vi.fn()
      .mockRejectedValueOnce(networkFailure("UND_ERR_CONNECT_TIMEOUT"))
      .mockResolvedValueOnce({ error: null });
    from.mockReturnValue({ upsert });

    const result = getProductInsightCacheRepository().upsert(record);
    await vi.advanceTimersByTimeAsync(200);
    await result;

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]).toEqual(upsert.mock.calls[1]);
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ product_id: "p1", variant_id: "v1", facts_hash: key.factsHash }),
      { onConflict: "product_id,variant_id,facts_hash", ignoreDuplicates: true },
    );
  });

  it("stops after three total requests when transport failures continue", async () => {
    const upsert = vi.fn(() => Promise.reject(networkFailure("ETIMEDOUT")));
    from.mockReturnValue({ upsert });

    const result = getProductInsightCacheRepository().upsert(record);
    const rejection = expect(result).rejects.toMatchObject({
      name: "InsightCacheWriteError",
      attempt: 3,
      transportCode: "ETIMEDOUT",
    });
    await vi.advanceTimersByTimeAsync(700);

    await rejection;
    expect(upsert).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["permission", { code: "42501", message: "permission denied for table product_insights" }],
    ["schema", { code: "PGRST204", message: "Could not find a requested column" }],
  ])("does not retry PostgREST %s errors", async (_kind, postgrestError) => {
    const upsert = vi.fn(() => Promise.resolve({
      error: postgrestError,
    }));
    from.mockReturnValue({ upsert });

    await expect(getProductInsightCacheRepository().upsert(record)).rejects.toMatchObject({
      name: "InsightCacheWriteError",
      attempt: 1,
      transportCode: null,
    });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("logs only safe retry metadata", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const upsert = vi.fn()
      .mockRejectedValueOnce(networkFailure("ECONNRESET"))
      .mockResolvedValueOnce({ error: null });
    from.mockReturnValue({ upsert });

    const result = getProductInsightCacheRepository().upsert(record);
    await vi.advanceTimersByTimeAsync(200);
    await result;

    expect(warning).toHaveBeenCalledWith(
      "[PriceAI][InsightCacheTransport]",
      JSON.stringify({ operation: "write", attempt: 1, code: "ECONNRESET" }),
    );
    const logged = JSON.stringify(warning.mock.calls);
    expect(logged).not.toContain("secret.example");
    expect(logged).not.toContain(key.factsHash);
    expect(logged).not.toContain("product_insights");
  });
});
