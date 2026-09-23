import { describe, expect, it } from "vitest";
import { defaultCatalogImageRenderSourceRegistry, selectCatalogImageRenderSource } from "./catalog-image-render-source";

import {
  createCatalogImageSourceRegistry,
  defaultCatalogImageSourceRegistry,
  selectCatalogImageSource,
} from "./catalog-image-source";

describe("Catalog image source registry", () => {
  it("keeps browser and server production host allowlists identical", () => {
    for (const policy of defaultCatalogImageSourceRegistry.policies) {
      expect(defaultCatalogImageRenderSourceRegistry.policies.find((entry) => entry.platform === policy.platform)?.allowedHosts).toEqual(policy.allowedHosts);
    }
    expect(selectCatalogImageRenderSource("pdd", "https://t00img.yangkeduo.com/example.png")).toBeNull();
  });
  it("keeps an owned fixture source unavailable unless an explicit test registry allows its hostname", () => {
    const url = "https://fixture.assets.priceai.test/catalog-image.png";

    expect(selectCatalogImageSource("priceai_fixture", url, defaultCatalogImageSourceRegistry)).toBeNull();

    const testRegistry = createCatalogImageSourceRegistry([
      { platform: "priceai_fixture", allowedHosts: ["fixture.assets.priceai.test"] },
    ]);

    expect(selectCatalogImageSource("priceai_fixture", url, testRegistry)).toEqual({
      url,
      sourceKind: "catalog_primary",
    });
  });

  it("rejects an owned fixture URL when its hostname is outside the explicit fixture allowlist", () => {
    const testRegistry = createCatalogImageSourceRegistry([
      { platform: "priceai_fixture", allowedHosts: ["fixture.assets.priceai.test"] },
    ]);

    expect(selectCatalogImageSource(
      "priceai_fixture",
      "https://other.assets.priceai.test/catalog-image.png",
      testRegistry,
    )).toBeNull();
  });

  it("preserves the production Taobao source allowlist without admitting an arbitrary hostname", () => {
    expect(selectCatalogImageSource(
      "taobao",
      "https://img.alicdn.com/catalog-image.png",
      defaultCatalogImageSourceRegistry,
    )).toMatchObject({ sourceKind: "catalog_primary" });
    expect(selectCatalogImageSource(
      "taobao",
      "https://untrusted.example/catalog-image.png",
      defaultCatalogImageSourceRegistry,
    )).toBeNull();
  });
});
