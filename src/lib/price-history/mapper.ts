import type { PriceHistoryRow } from "@/lib/supabase/database.types";

import type { PriceHistoryPoint } from "./types";

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function requiredString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Converts database data into a safe domain object; malformed rows are discarded. */
export function mapPriceHistoryRow(row: PriceHistoryRow): PriceHistoryPoint | null {
  const price = Number(row.price);
  const originalPrice = row.original_price === null ? null : Number(row.original_price);

  if (
    !requiredString(row.id) ||
    !requiredString(row.product_id) ||
    !requiredString(row.variant_id) ||
    !requiredString(row.platform) ||
    !requiredString(row.currency) ||
    !Number.isFinite(price) ||
    price < 0 ||
    !isValidDate(row.recorded_at) ||
    !isValidDate(row.created_at)
  ) {
    return null;
  }

  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    platform: row.platform,
    externalOfferId: row.external_offer_id,
    price,
    originalPrice: originalPrice !== null && Number.isFinite(originalPrice) && originalPrice >= 0 ? originalPrice : null,
    currency: row.currency,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
  };
}
