import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CatalogImageResolution } from "@/lib/catalog-images/types";

import { CatalogProductImage } from "./catalog-product-image";

const approvedImage: CatalogImageResolution = {
  kind: "image",
  source: "approved_product",
  url: "https://img.alicdn.com/xiaomi-15.jpg",
  imageId: "image-1",
  platform: "taobao",
};

describe("CatalogProductImage", () => {
  it("renders the resolved image with the Catalog Product name as alt text", () => {
    const html = renderToStaticMarkup(
      <CatalogProductImage productName="小米 15" resolution={approvedImage} />,
    );

    expect(html).toContain('src="https://img.alicdn.com/xiaomi-15.jpg"');
    expect(html).toContain('alt="小米 15"');
  });

  it("renders a neutral and size-stable no-image state", () => {
    const html = renderToStaticMarkup(
      <CatalogProductImage
        productName="无图商品"
        resolution={{ kind: "none", source: "none", url: null, imageId: null, platform: null }}
      />,
    );

    expect(html).toContain("暂无商品图");
    expect(html).toContain("无图商品：暂无商品图");
    expect(html).not.toContain("phone-placeholder.svg");
  });
});
