import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getProductBySlug: vi.fn(),
  resolveCatalogImageForProduct: vi.fn(),
  getProductInsight: vi.fn(),
  getVariantPriceHistoryViewModel: vi.fn(),
}));

vi.mock("@/lib/catalog/repository", () => ({ getProductBySlug: mocks.getProductBySlug }));
vi.mock("@/lib/catalog-images/service", () => ({ resolveCatalogImageForProduct: mocks.resolveCatalogImageForProduct }));
vi.mock("@/lib/ai/product-insight", () => ({ getProductInsight: mocks.getProductInsight }));
vi.mock("@/lib/price-history/service", () => ({ getVariantPriceHistoryViewModel: mocks.getVariantPriceHistoryViewModel }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => <footer /> }));
vi.mock("@/components/product/product-insight-panel", () => ({ ProductInsightPanel: () => null }));
vi.mock("@/components/price-history/price-history-panel", () => ({ PriceHistoryPanel: () => null }));
vi.mock("@/components/compare/compare-selection", () => ({ CompareToggleButton: () => null }));

import { phones } from "@/data/phones";
import ProductPage from "./page";

describe("product detail Catalog primary image", () => {
  it("resolves the explicitly selected Variant before rendering the product hero", async () => {
    const product = phones.find((item) => item.slug === "xiaomi-15")!;
    const variant = product.variants[0];
    mocks.getProductBySlug.mockResolvedValue(product);
    mocks.resolveCatalogImageForProduct.mockResolvedValue({
      kind: "image", source: "approved_product", url: "https://img.alicdn.com/detail-xiaomi.jpg", imageId: "image-xiaomi", platform: "taobao",
    });
    mocks.getProductInsight.mockResolvedValue({});
    mocks.getVariantPriceHistoryViewModel.mockResolvedValue(null);

    const html = renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ slug: product.slug }) }));

    expect(mocks.resolveCatalogImageForProduct).toHaveBeenCalledWith({
      productId: product.id,
      variantId: variant.id,
      legacyImage: product.image,
    });
    expect(html).toContain("https://img.alicdn.com/detail-xiaomi.jpg");
  });
});
