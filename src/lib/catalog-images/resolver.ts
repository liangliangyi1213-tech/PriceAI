import { selectProviderImageSource, type LiveImagePlatform } from "@/lib/images/live-listing-image";

import type { CatalogImage, CatalogImageResolution } from "./types";
import { isCatalogImageStoragePublicUrl } from "./storage-url";

export type CatalogStorageUrlResolver = (image: CatalogImage) => string | null;

const noCatalogImage = (): CatalogImageResolution => ({
  kind: "none",
  source: "none",
  url: null,
  imageId: null,
  platform: null,
});

function isValidLegacyImage(value: string | null | undefined): value is string {
  const image = value?.trim();
  if (!image || /placeholder/i.test(image)) return false;
  if (image.startsWith("/")) return !image.startsWith("//") && !image.includes("..");
  try {
    const url = new URL(image);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function approvedImageUrl(image: CatalogImage): string | null {
  const platform: LiveImagePlatform | null = image.platform === "taobao"
    ? "taobao"
    : image.platform === "pdd"
      ? "pinduoduo"
      : null;
  if (!platform) return null;
  return selectProviderImageSource(platform, [{ kind: image.sourceKind, url: image.sourceUrl }])?.url ?? null;
}

export function resolveCatalogImage({
  productId,
  variantId,
  images,
  legacyImage,
  storageUrlForImage,
}: {
  productId: string;
  variantId: string | null;
  images: readonly CatalogImage[];
  legacyImage: string | null | undefined;
  storageUrlForImage?: CatalogStorageUrlResolver;
}): CatalogImageResolution {
  const approvedPrimaries = images.filter((image) =>
    image.productId === productId && image.status === "approved" && image.role === "primary",
  );
  const variantPrimary = variantId
    ? approvedPrimaries.find((image) => image.targetType === "variant" && image.variantId === variantId)
    : undefined;
  const productPrimary = approvedPrimaries.find((image) =>
    image.targetType === "product" && image.variantId === null,
  );

  for (const selected of [variantPrimary, productPrimary]) {
    if (!selected) continue;
    const target = selected.targetType === "variant" ? "approved_variant" : "approved_product";
    const storageUrl = storageUrlForImage?.(selected) ?? null;
    if (storageUrl) {
      return {
        kind: "image",
        source: `${target}_storage`,
        url: storageUrl,
        imageId: selected.id,
        platform: selected.platform,
      };
    }
    const remoteUrl = approvedImageUrl(selected);
    if (remoteUrl) {
      return {
        kind: "image",
        source: target,
        url: remoteUrl,
        imageId: selected.id,
        platform: selected.platform,
      };
    }
  }
  if (isValidLegacyImage(legacyImage)) {
    return { kind: "image", source: "legacy", url: legacyImage.trim(), imageId: null, platform: null };
  }
  return noCatalogImage();
}

export function resolveRenderableCatalogImage(
  resolution: CatalogImageResolution,
  failedUrl: string | null,
): CatalogImageResolution {
  if (resolution.kind === "none" || resolution.url === failedUrl) return noCatalogImage();
  if (resolution.source === "legacy") return isValidLegacyImage(resolution.url) ? resolution : noCatalogImage();
  if (resolution.source === "approved_product_storage" || resolution.source === "approved_variant_storage") {
    return isCatalogImageStoragePublicUrl(resolution.url) ? resolution : noCatalogImage();
  }
  if (!resolution.platform) return noCatalogImage();
  const platform: LiveImagePlatform | null = resolution.platform === "taobao"
    ? "taobao"
    : resolution.platform === "pdd"
      ? "pinduoduo"
      : null;
  if (!platform) return noCatalogImage();
  const safe = selectProviderImageSource(platform, [{ kind: "catalog_primary", url: resolution.url }]);
  return safe?.url === resolution.url ? resolution : noCatalogImage();
}
