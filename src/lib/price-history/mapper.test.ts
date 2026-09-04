import { describe, expect, it } from "vitest";

import { mapPriceHistoryRow } from "./mapper";

describe("mapPriceHistoryRow", () => {
  it("maps a Supabase row into a PriceHistoryPoint", () => {
    expect(mapPriceHistoryRow({
      id: "history-1",
      product_id: "product-1",
      variant_id: "variant-1",
      platform: "future-platform",
      external_offer_id: null,
      price: "7999.00",
      original_price: "8299.00",
      currency: "CNY",
      recorded_at: "2026-08-01T00:00:00Z",
      created_at: "2026-08-01T00:00:01Z",
    })).toEqual({
      id: "history-1",
      productId: "product-1",
      variantId: "variant-1",
      platform: "future-platform",
      externalOfferId: null,
      price: 7999,
      originalPrice: 8299,
      currency: "CNY",
      recordedAt: "2026-08-01T00:00:00Z",
      createdAt: "2026-08-01T00:00:01Z",
    });
  });

  it("drops invalid database data rather than exposing it to domain consumers", () => {
    expect(mapPriceHistoryRow({
      id: "history-1",
      product_id: "product-1",
      variant_id: "variant-1",
      platform: "future-platform",
      external_offer_id: null,
      price: -1,
      original_price: null,
      currency: "CNY",
      recorded_at: "invalid",
      created_at: "2026-08-01T00:00:01Z",
    })).toBeNull();
  });
});
