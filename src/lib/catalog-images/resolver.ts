import type { CatalogImage, CatalogImageResolution } from "./types";

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

export function resolveCatalogImage({
  productId,
  variantId,
  images,
  legacyImage,
}: {
  productId: string;
  variantId?: string | null;
  images: readonly CatalogImage[];
  legacyImage: string | null | undefined;
}): CatalogImageResolution {
  const approvedPrimaries = images.filter((image) =>
    image.productId === productId
    && image.status === "approved"
    && image.role === "primary",
  );
  const variantPrimary = variantId
    ? approvedPrimaries.find((image) => image.targetType === "variant" && image.variantId === variantId)
    : undefined;
  const productPrimary = approvedPrimaries.find((image) =>
    image.targetType === "product" && image.variantId === null,
  );
  const selected = variantPrimary ?? productPrimary;

  if (selected) {
    return {
      kind: "image",
      source: selected.targetType === "variant" ? "approved_variant" : "approved_product",
      url: selected.sourceUrl,
      imageId: selected.id,
    };
  }
  if (isValidLegacyImage(legacyImage)) {
    return { kind: "image", source: "legacy", url: legacyImage.trim(), imageId: null };
  }
  return { kind: "none", source: "none", url: null, imageId: null };
}
