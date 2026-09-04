import { describe, expect, it } from "vitest";
import { specificationSummary } from "./specification-summary";

describe("category-aware core specification summary", () => {
  it("keeps existing phone variant values and order", () => {
    expect(specificationSummary("phone", { storage: "256GB", color: "黑色", region: "国行", condition: "全新" })).toBe("256GB · 黑色 · 国行 · 全新");
  });
  it("uses supplied core specifications without assuming phone fields", () => {
    expect(specificationSummary("clothing", { coreSpecifications: ["L码", "黑色", "纯棉", "男款"] })).toBe("L码 · 黑色 · 纯棉 · 男款");
    expect(specificationSummary("household", { coreSpecifications: ["3kg", "薰衣草香", "瓶装"] })).toBe("3kg · 薰衣草香 · 瓶装");
  });
  it("prefers supplied summaries and omits missing data without borrowing phone defaults", () => {
    expect(specificationSummary("phone", { storage: "256GB", coreSpecifications: [" 512GB ", "", "白色"] })).toBe("512GB · 白色");
    expect(specificationSummary("food", { storage: "256GB" })).toBe("");
    expect(specificationSummary("phone", undefined)).toBe("");
  });
});
