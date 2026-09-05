import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { phones } from "@/data/phones";
import { fallbackInsight, buildProductFacts } from "@/lib/ai/product-insight";
import { scoreVariant } from "@/lib/scoring/value-score";
import { ProductDecisionHero } from "./product-decision-hero";
import { ProductInsightPanel } from "./product-insight-panel";
import { ProductSpecifications } from "./product-specifications";
import { PlatformOffers } from "./platform-offers";

const product = phones[0];
const variant = product.variants[0];

describe("product detail decision center", () => {
  it("puts the current buying decision in the hero without inventing a purchase link", () => {
    const html = renderToStaticMarkup(<ProductDecisionHero product={product} score={scoreVariant(variant).total} variant={variant} />);
    expect(html).toMatch(/Apple[\s\S]*iPhone 16 Pro[\s\S]*256GB[\s\S]*¥7,599[\s\S]*购买参考[\s\S]*第二低报价低 ¥200[\s\S]*PriceAI 评分：68[\s\S]*表现一般[\s\S]*最低价平台[\s\S]*拼多多/);
    expect(html).toContain('href="#platform-offers"');
    expect(html).not.toContain("立即购买");
  });

  it("allows a long unbroken product name to wrap inside a narrow card", () => {
    const longName = "VeryLongProductModelNameWithoutAnyNaturalBreakPoint1234567890";
    const html = renderToStaticMarkup(<ProductDecisionHero product={{ ...product, name: longName }} score={68} variant={variant} />);
    expect(html).toContain(longName);
    expect(html).toContain("[overflow-wrap:anywhere]");
  });

  it("shows only reliable offer links and keeps existing offer facts", () => {
    const html = renderToStaticMarkup(<PlatformOffers offers={variant.offers} />);
    expect(html).toMatch(/平台报价[\s\S]*拼多多[\s\S]*当前最低[\s\S]*¥7,599/);
    expect(html).toContain("平台评分 4.6");
    expect(html).toContain("销量 41,000");
    expect(html).not.toContain("去购买");
    const linked = renderToStaticMarkup(<PlatformOffers offers={[{ ...variant.offers[0], url: "https://example.com/item" }]} />);
    expect(linked).toContain("去购买");
    expect(linked).toContain('aria-label="前往京东购买（新标签页）"');
    expect(linked).toContain('target="_blank"');
    expect(linked).toContain('rel="noopener noreferrer"');
    expect(renderToStaticMarkup(<PlatformOffers offers={[{ ...variant.offers[0], url: "https://" }]} />)).not.toContain("去购买");
  });

  it("uses existing AI fields and category-neutral product specs", () => {
    const insight = fallbackInsight(buildProductFacts(product, variant));
    const ai = renderToStaticMarkup(<ProductInsightPanel insight={insight} />);
    expect(ai).toMatch(/AI 购买建议[\s\S]*一句话购买结论[\s\S]*主要优点[\s\S]*需要注意[\s\S]*适合谁[\s\S]*不太适合谁[\s\S]*购买建议/);
    const specs = renderToStaticMarkup(<ProductSpecifications specs={{ 材质: "纯棉", 尺码: "L" }} />);
    expect(specs).toMatch(/商品规格[\s\S]*材质[\s\S]*纯棉[\s\S]*尺码[\s\S]*L/);
    expect(renderToStaticMarkup(<ProductSpecifications specs={{}} />)).toContain("暂无商品规格数据");
  });
});
