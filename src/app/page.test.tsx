import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getProducts: vi.fn(),
  resolveCatalogImagesForProducts: vi.fn(),
}));

vi.mock("@/lib/catalog/repository", () => ({ getProducts: mocks.getProducts }));
vi.mock("@/lib/catalog-images/service", () => ({ resolveCatalogImagesForProducts: mocks.resolveCatalogImagesForProducts }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => <footer /> }));
vi.mock("@/components/search/search-form", () => ({ SearchForm: () => <form role="search" /> }));

import { phones } from "@/data/phones";
import Home from "./page";

describe("home Catalog primary images", () => {
  beforeEach(() => {
    mocks.getProducts.mockReset().mockResolvedValue(phones.slice(0, 6));
    mocks.resolveCatalogImagesForProducts.mockReset().mockImplementation(async (inputs: Array<{ productId: string; variantId: string | null }>) =>
      inputs.map((input) => ({
        ...input,
        resolution: input.productId === "xiaomi-15"
          ? { kind: "image", source: "approved_product", url: "https://img.alicdn.com/home-xiaomi.jpg", imageId: "image-xiaomi", platform: "taobao" }
          : { kind: "none", source: "none", url: null, imageId: null, platform: null },
      })),
    );
  });

  it("resolves homepage products with explicit Product-only contexts", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(mocks.resolveCatalogImagesForProducts).toHaveBeenCalledWith(
      phones.slice(0, 6).map((product) => ({ productId: product.id, variantId: null, legacyImage: product.image })),
    );
    expect(html).toContain("https://img.alicdn.com/home-xiaomi.jpg");
    expect(html).toContain("暂无商品图");
  });
});
