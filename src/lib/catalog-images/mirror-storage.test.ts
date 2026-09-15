import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getCatalogSyncWriteClient: vi.fn() }));
vi.mock("@/lib/catalog-sync/write-client", () => ({
  getCatalogSyncWriteClient: mocks.getCatalogSyncWriteClient,
}));

import { buildCatalogMirrorObjectPath, createSupabaseMirrorStorage, storeCatalogMirror } from "./mirror-storage";
import { CatalogImageMirrorError } from "./mirror-service-types";

const bytes = Uint8Array.from([1, 2, 3, 4]);
const hash = createHash("sha256").update(bytes).digest("hex");

describe("Catalog mirror Storage", () => {
  it("builds isolated Product and Variant object paths from internal identities", () => {
    expect(buildCatalogMirrorObjectPath({ productId: "product-1", variantId: null, imageId: "image-1", contentHash: hash, extension: "png" }))
      .toBe(`products/product-1/image-1/${hash}.png`);
    expect(buildCatalogMirrorObjectPath({ productId: "product-1", variantId: "variant-1", imageId: "image-1", contentHash: hash, extension: "webp" }))
      .toBe(`products/product-1/variants/variant-1/image-1/${hash}.webp`);
  });

  it("rejects untrusted path segments instead of exposing source identities in Storage paths", () => {
    expect(() => buildCatalogMirrorObjectPath({
      productId: "../product", variantId: null, imageId: "image-1", contentHash: hash, extension: "png",
    })).toThrow(expect.objectContaining({ code: "invalid_object_identity" }));
  });

  it("uses the fixed bucket and Supabase Storage API without overwrite", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "stored" }, error: null });
    const from = vi.fn().mockReturnValue({ upload });
    mocks.getCatalogSyncWriteClient.mockReturnValue({ storage: { from } });

    await expect(createSupabaseMirrorStorage().upload({
      path: "products/p/i/hash.png", bytes, contentType: "image/png", upsert: false,
    })).resolves.toBe("uploaded");
    expect(from).toHaveBeenCalledWith("catalog-images");
    expect(upload).toHaveBeenCalledWith("products/p/i/hash.png", bytes, {
      contentType: "image/png", cacheControl: "31536000", upsert: false,
    });
  });

  it("treats the Storage API not-found response as an available upload path", async () => {
    const exists = vi.fn().mockResolvedValue({
      data: false,
      error: { name: "StorageApiError", status: 404, statusCode: "404" },
    });
    mocks.getCatalogSyncWriteClient.mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ exists }) },
    });

    await expect(createSupabaseMirrorStorage().exists("products/p/i/hash.png"))
      .resolves.toBe(false);
  });

  it("uploads without overwrite and returns uploaded", async () => {
    const storage = {
      exists: vi.fn().mockResolvedValue(false),
      upload: vi.fn().mockResolvedValue("uploaded" as const),
      download: vi.fn(),
    };
    await expect(storeCatalogMirror({ path: "products/p/i/hash.png", bytes, contentHash: hash, contentType: "image/png" }, storage))
      .resolves.toEqual({ status: "uploaded", path: "products/p/i/hash.png" });
    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({ upsert: false }));
  });

  it("reuses an existing object only after its downloaded bytes match the hash", async () => {
    const storage = {
      exists: vi.fn().mockResolvedValue(true),
      upload: vi.fn(),
      download: vi.fn().mockResolvedValue(bytes),
    };
    await expect(storeCatalogMirror({ path: "products/p/i/hash.png", bytes, contentHash: hash, contentType: "image/png" }, storage))
      .resolves.toEqual({ status: "reused", path: "products/p/i/hash.png" });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("handles an upload race by validating and reusing the winner", async () => {
    const storage = {
      exists: vi.fn().mockResolvedValue(false),
      upload: vi.fn().mockResolvedValue("conflict" as const),
      download: vi.fn().mockResolvedValue(bytes),
    };
    await expect(storeCatalogMirror({ path: "products/p/i/hash.png", bytes, contentHash: hash, contentType: "image/png" }, storage))
      .resolves.toEqual({ status: "reused", path: "products/p/i/hash.png" });
  });

  it("rejects upload failures and existing objects with different content", async () => {
    await expect(storeCatalogMirror({ path: "products/p/i/hash.png", bytes, contentHash: hash, contentType: "image/png" }, {
      exists: vi.fn().mockResolvedValue(false), upload: vi.fn().mockResolvedValue("failed"), download: vi.fn(),
    })).rejects.toEqual(new CatalogImageMirrorError("upload_failed"));
    await expect(storeCatalogMirror({ path: "products/p/i/hash.png", bytes, contentHash: hash, contentType: "image/png" }, {
      exists: vi.fn().mockResolvedValue(true), upload: vi.fn(), download: vi.fn().mockResolvedValue(Uint8Array.from([9])),
    })).rejects.toEqual(new CatalogImageMirrorError("upload_failed"));
  });
});
