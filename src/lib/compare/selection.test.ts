import { describe, expect, it } from "vitest";

import { toggleCompareSelection } from "./selection";

describe("compare selection", () => {
  it("adds and removes a product without duplicates", () => {
    expect(toggleCompareSelection(["a", "b"], "c")).toEqual({ selectedSlugs: ["a", "b", "c"], status: "added" });
    expect(toggleCompareSelection(["a", "b"], "a")).toEqual({ selectedSlugs: ["b"], status: "removed" });
  });

  it("enforces the four-product maximum", () => {
    expect(toggleCompareSelection(["a", "b", "c", "d"], "e")).toEqual({
      selectedSlugs: ["a", "b", "c", "d"],
      status: "limit_reached",
    });
  });
});
