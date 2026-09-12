export type CatalogImageTargetType = "product" | "variant";
export type CatalogImageRole = "primary" | "gallery";
export type CatalogImageStatus = "candidate" | "approved" | "rejected" | "unavailable";

export type CatalogImage = Readonly<{
  id: string;
  productId: string;
  variantId: string | null;
  targetType: CatalogImageTargetType;
  role: CatalogImageRole;
  status: CatalogImageStatus;
  platform: string;
  externalProductId: string;
  externalVariantId: string | null;
  sourceKind: string;
  sourceUrl: string;
  sourceHost: string;
  sourceUrlHash: string;
  contentHash: string | null;
  storageBucket: string | null;
  storageObjectPath: string | null;
  verifiedAt: string | null;
}>;

export type CatalogImageResolution = Readonly<{
  kind: "image";
  source: "approved_variant" | "approved_product" | "legacy";
  url: string;
  imageId: string | null;
}> | Readonly<{
  kind: "none";
  source: "none";
  url: null;
  imageId: null;
}>;

export type CreateCatalogImageCandidate = Readonly<{
  productId: string;
  variantId: string | null;
  targetType: CatalogImageTargetType;
  platform: string;
  externalProductId: string;
  externalVariantId: string | null;
  sourceKind: string;
  sourceUrl: string;
}>;

export type AppendPrimaryImageEvent = Readonly<{
  productId: string;
  variantId: string | null;
  targetType: CatalogImageTargetType;
  previousImageId: string | null;
  newImageId: string | null;
  action: "initial" | "replace" | "rollback" | "clear";
  reason: string;
  changedBy: string;
}>;
