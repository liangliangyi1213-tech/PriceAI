import "server-only";

import { getSupabase } from "@/lib/supabase/client";

import { buildCatalogMirrorObjectPath } from "./mirror-storage";
import { CATALOG_IMAGE_BUCKET, isCatalogImageStoragePublicUrl } from "./storage-url";
import type { CatalogImage } from "./types";

export type CatalogStoragePublicUrlClient = Readonly<{
  getPublicUrl(path: string): Readonly<{ data: Readonly<{ publicUrl: string }> }>;
}>;

const extensionByContentType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export function getCanonicalCatalogImageStoragePath(image: CatalogImage): string | null {
  if (image.storageBucket !== CATALOG_IMAGE_BUCKET || !image.storageObjectPath
    || !image.contentHash || !/^[a-f0-9]{64}$/.test(image.contentHash)
    || !image.contentType || !image.width || !image.height || image.width <= 0 || image.height <= 0
    || !image.mirroredAt || !Number.isFinite(Date.parse(image.mirroredAt))) return null;
  if (image.targetType === "product" ? image.variantId !== null : !image.variantId) return null;
  const extension = extensionByContentType[image.contentType];
  if (!extension) return null;
  try {
    const expected = buildCatalogMirrorObjectPath({
      productId: image.productId,
      variantId: image.variantId,
      imageId: image.id,
      contentHash: image.contentHash,
      extension,
    });
    return image.storageObjectPath === expected ? expected : null;
  } catch {
    return null;
  }
}

export function getValidCatalogImageStoragePath(image: CatalogImage): string | null {
  if (image.status !== "approved" || image.role !== "primary") return null;
  return getCanonicalCatalogImageStoragePath(image);
}

export function resolveCatalogImageStorageUrl(
  image: CatalogImage,
  storage?: CatalogStoragePublicUrlClient,
): string | null {
  const path = getValidCatalogImageStoragePath(image);
  if (!path) return null;
  try {
    const storageClient = storage ?? getSupabase().storage.from(CATALOG_IMAGE_BUCKET);
    const publicUrl = storageClient.getPublicUrl(path).data.publicUrl;
    return isCatalogImageStoragePublicUrl(publicUrl, path) ? publicUrl : null;
  } catch {
    return null;
  }
}
