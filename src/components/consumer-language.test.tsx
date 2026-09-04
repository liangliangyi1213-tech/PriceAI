import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { phones } from "@/data/phones";
import { buildCompareProducts } from "@/lib/compare/compare-products";
import { Capabilities } from "./home/capabilities";
import { CompareTable } from "./compare/compare-table";

describe("consumer-facing Chinese labels", () => {
  it("explains platform comparison without exposing Offer terminology", () => {
    const html = renderToStaticMarkup(<Capabilities />);
    expect(html).toContain("比较不同平台的报价");
    expect(html).not.toContain("Offer");
  });
  it("labels real comparison metrics in Chinese without changing their values", () => {
    const products = buildCompareProducts(phones, ["apple-iphone-16-pro", "huawei-mate-70-pro"]);
    const html = renderToStaticMarkup(<CompareTable products={products} />);
    expect(html).toContain("平台评分");
    expect(html).toContain("销量");
    expect(html).toContain("可用报价数量");
    expect(html).toContain("PriceAI 评分");
    expect(html).toContain("¥7,599");
    expect(html).not.toMatch(/Rating|Sales|Offer|CPU/);
  });
});
