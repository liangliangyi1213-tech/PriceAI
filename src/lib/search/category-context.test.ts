import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";

import {
  filterCatalogProductsForContext,
  getSearchCategory,
  resolveSearchContext,
} from "./category-context";

describe("search category context", () => {
  it("resolves Xiaomi 15 catalog matches to the phones context", () => {
    const xiaomi15 = phones.find((product) => product.slug === "xiaomi-15")!;

    const context = resolveSearchContext({ query: "小米15", catalogMatches: [xiaomi15] });

    expect(context).toMatchObject({ id: "phones", source: "catalog", matcher: "phone" });
    expect(context.taobaoCategoryId).toBe("1512");
    expect(context.facets).toEqual({ brands: true, price: true, score: true, rating: true, sales: true });
  });

  it("recognizes unsupported categories without inheriting phone capabilities", () => {
    const context = resolveSearchContext({ query: "秋季衣服", catalogMatches: [] });

    expect(context).toMatchObject({ id: "clothing", label: "服饰", source: "keyword", matcher: null });
    expect(context.taobaoCategoryId).toBeUndefined();
    expect(context.facets).toEqual({ brands: false, price: false, score: false, rating: false, sales: false });
    expect(filterCatalogProductsForContext(phones, context)).toEqual([]);
  });

  it.each([
    ["鞋子", "clothing"],
    ["蓝牙耳机", "headphones"],
    ["笔记本电脑", "computers"],
    ["冰箱家电", "appliances"],
  ] as const)("recognizes %s as %s", (query, category) => {
    expect(resolveSearchContext({ query, catalogMatches: [] }).id).toBe(category);
  });

  it("falls back unknown explicit category values to an unprivileged all context", () => {
    const category = getSearchCategory("unknown-category");
    const context = resolveSearchContext({ requestedCategory: category.id, query: "小米15", catalogMatches: [phones[0]] });

    expect(category.id).toBe("all");
    expect(context).toMatchObject({ id: "all", source: "explicit", matcher: null });
    expect(context.taobaoCategoryId).toBeUndefined();
    expect(context.facets).toEqual({ brands: false, price: false, score: false, rating: false, sales: false });
  });
});
