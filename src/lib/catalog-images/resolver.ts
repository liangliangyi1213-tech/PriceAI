import { selectProviderImageSource, type LiveImagePlatform } from "@/lib/images/live-listing-image";

import type { CatalogImage, CatalogImageResolution } from "./types";

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
}: {
  productId: string;
  variantId: string | null;
  images: readonly CatalogImage[];
  legacyImage: string | null | undefined;
}): CatalogImageResolution {
  const approvedPrimaries = images.flatMap((image) => {
    if (image.productId !== productId || image.status !== "approved" || image.role !== "primary") return [];
    const safeUrl = approvedImageUrl(image);
    return safeUrl ? [{ image, safeUrl }] : [];
  });
  const variantPrimary = variantId
    ? approvedPrimaries.find(({ image }) => image.targetType === "variant" && image.variantId === variantId)
    : undefined;
  const productPrimary = approvedPrimaries.find(({ image }) =>
    image.targetType === "product" && image.variantId === null,
  );
  const selected = variantPrimary ?? productPrimary;

  if (selected) {
    return {
      kind: "image",
      source: selected.image.targetType === "variant" ? "approved_variant" : "approved_product",
      url: selected.safeUrl,
      imageId: selected.image.id,
      platform: selected.image.platform,
    };
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
