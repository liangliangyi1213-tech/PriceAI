import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getProducts: vi.fn(),
  resolveCatalogImagesForProducts: vi.fn(),
}));

vi.mock("@/lib/catalog/repository", () => ({ getProducts: mocks.getProducts }));
vi.mock("@/lib/catalog-images/service", () => ({ resolveCatalogImagesForProducts: mocks.resolveCatalogImagesForProducts }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => <footer /> }));

import { phones } from "@/data/phones";
import PhonesRankingPage from "./page";

describe("phone ranking Catalog primary images", () => {
  it("uses Product-only image contexts for every ranked product", async () => {
    const products = phones.slice(0, 2);
    mocks.getProducts.mockResolvedValue(products);
    mocks.resolveCatalogImagesForProducts.mockImplementation(async (inputs: Array<{ productId: string; variantId: string | null }>) =>
      inputs.map((input) => ({
        ...input,
        resolution: input.productId === products[0].id
          ? { kind: "image", source: "approved_product", url: "https://img.alicdn.com/ranking-primary.jpg", imageId: "image-ranking", platform: "taobao" }
          : { kind: "none", source: "none", url: null, imageId: null, platform: null },
      })),
    );

    const html = renderToStaticMarkup(await PhonesRankingPage());

    expect(mocks.resolveCatalogImagesForProducts).toHaveBeenCalledWith(
      products.map((product) => ({ productId: product.id, variantId: null, legacyImage: product.image })),
    );
    expect(html).toContain("https://img.alicdn.com/ranking-primary.jpg");
    expect(html).toContain("暂无商品图");
  });
});
