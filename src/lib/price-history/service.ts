import "server-only";

import { getVariantPriceHistory } from "./repository";
import { buildPriceHistoryViewModel } from "./presentation";
import type { PriceHistoryRange, PriceHistoryViewModel } from "./types";

/** Retrieves price history for a page while making an unavailable history source non-fatal. */
export async function getVariantPriceHistoryViewModel(
  variantId: string,
  range: PriceHistoryRange = {},
): Promise<PriceHistoryViewModel> {
  try {
    return buildPriceHistoryViewModel(await getVariantPriceHistory(variantId, range));
  } catch (error) {
    const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
    console.error("[PriceAI][PriceHistory] presentation read failed", {
      name: typeof record.name === "string" ? record.name : "UnknownError",
    });
    return buildPriceHistoryViewModel([]);
  }
}
