import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSupabase: vi.fn(),
  getPriceHistoryWriteClient: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ getSupabase: mocks.getSupabase }));
vi.mock("./write-client", () => ({ getPriceHistoryWriteClient: mocks.getPriceHistoryWriteClient }));

import {
  getVariantPriceHistory,
  recordPriceSnapshot,
} from "./repository";

describe("price history repository", () => {
  it("queries a variant history with date range and ascending time ordering", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{
      id: "history-1", product_id: "product-1", variant_id: "variant-1", platform: "market", external_offer_id: null,
      price: 100, original_price: null, currency: "CNY", recorded_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:01Z",
    }], error: null });
    const lte = vi.fn(() => ({ order }));
    const gte = vi.fn(() => ({ lte, order }));
    const eq = vi.fn(() => ({ gte, lte, order }));
    mocks.getSupabase.mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) });

    const history = await getVariantPriceHistory("variant-1", {
      from: "2026-08-01T00:00:00Z",
      to: "2026-08-31T23:59:59Z",
    });

    expect(eq).toHaveBeenCalledWith("variant_id", "variant-1");
    expect(gte).toHaveBeenCalledWith("recorded_at", "2026-08-01T00:00:00Z");
    expect(lte).toHaveBeenCalledWith("recorded_at", "2026-08-31T23:59:59Z");
    expect(order).toHaveBeenCalledWith("recorded_at", { ascending: true });
    expect(history[0]).toMatchObject({ variantId: "variant-1", price: 100 });
  });

  it("writes a normalized server-side snapshot", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.getPriceHistoryWriteClient.mockReturnValue({ from: vi.fn(() => ({ insert })) });

    await recordPriceSnapshot({
      productId: "product-1",
      variantId: "variant-1",
      platform: "future-platform",
      externalOfferId: "external-1",
      price: 100,
      originalPrice: null,
      recordedAt: "2026-08-01T00:00:00Z",
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      product_id: "product-1",
      variant_id: "variant-1",
      platform: "future-platform",
      price: 100,
      currency: "CNY",
    }));
  });

  it("returns a safe repository error when Supabase responds with an error", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("provider secret detail") });
    const eq = vi.fn(() => ({ order }));
    mocks.getSupabase.mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) });

    await expect(getVariantPriceHistory("variant-1")).rejects.toMatchObject({
      name: "PriceHistoryRepositoryError",
      message: "读取价格历史失败，请稍后重试。",
    });
    await expect(getVariantPriceHistory("variant-1")).rejects.not.toThrow("provider secret detail");
  });
});
