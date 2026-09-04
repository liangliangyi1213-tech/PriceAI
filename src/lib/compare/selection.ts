import { compareProductLimit, parseCompareQuery } from "./query";
import type { CompareSelectionResult } from "./types";

/** Adds or removes a slug while preserving the URL-safe selection limit. */
export function toggleCompareSelection(selectedSlugs: string[], slug: string): CompareSelectionResult {
  const normalizedSelection = parseCompareQuery(selectedSlugs);
  const normalizedSlug = slug.trim();

  if (normalizedSelection.includes(normalizedSlug)) {
    return { selectedSlugs: normalizedSelection.filter((selected) => selected !== normalizedSlug), status: "removed" };
  }
  if (!normalizedSlug || normalizedSelection.length >= compareProductLimit) {
    return { selectedSlugs: normalizedSelection, status: "limit_reached" };
  }

  return { selectedSlugs: [...normalizedSelection, normalizedSlug], status: "added" };
}
