import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CatalogImagePreview, resolveCatalogAdminPreviewUrl } from "./catalog-image-preview";

describe("CatalogImagePreview", () => {
  it("renders only an allowlisted HTTPS provider image", () => {
    const safe = "https://img.alicdn.com/candidate.jpg";
    expect(resolveCatalogAdminPreviewUrl("taobao", safe, null)).toBe(safe);
    expect(resolveCatalogAdminPreviewUrl("taobao", "http://img.alicdn.com/candidate.jpg", null)).toBeNull();
    expect(resolveCatalogAdminPreviewUrl("taobao", "https://untrusted.example/candidate.jpg", null)).toBeNull();
  });

  it("degrades one failed URL directly to the neutral unavailable state", () => {
    const safe = "https://img.alicdn.com/candidate.jpg";
    expect(resolveCatalogAdminPreviewUrl("taobao", safe, safe)).toBeNull();
    const html = renderToStaticMarkup(<CatalogImagePreview imagePlatform={null} imageUrl={null} label="Candidate" productName="示例商品"/>);
    expect(html).toContain("图片不可用");
  });
});
