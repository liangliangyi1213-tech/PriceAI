export type CatalogImageTargetType = "product" | "variant";
export type CatalogImageRole = "primary" | "gallery";
export type CatalogImageStatus = "candidate" | "approved" | "rejected" | "unavailable";
export type CatalogImageMatchSignal =
  | "brand"
  | "model"
  | "category"
  | "storage"
  | "color"
  | "region"
  | "condition";
export type CatalogImageMatcher =
  | "taobao_phone_strict"
  | "pinduoduo_phone_strict"
  | "catalog_sync_deterministic";

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
  matchConfidence: number | null;
  matchEvidence: Record<string, unknown> | null;
  contentHash: string | null;
  storageBucket: string | null;
  storageObjectPath: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verificationMethod: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}>;

export type CatalogImagePrimaryEvent = Readonly<{
  id: string;
  productId: string;
  variantId: string | null;
  targetType: CatalogImageTargetType;
  previousImageId: string | null;
  newImageId: string | null;
  action: "initial" | "replace" | "rollback" | "clear";
  reason: string;
  changedBy: string;
  createdAt: string;
}>;

export type CatalogImageResolution = Readonly<{
  kind: "image";
  source: "approved_variant" | "approved_product" | "legacy";
  url: string;
  imageId: string | null;
  platform: string | null;
}> | Readonly<{
  kind: "none";
  source: "none";
  url: null;
  imageId: null;
  platform: null;
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
  matchConfidence: number;
  matchEvidence: Readonly<{
    schemaVersion: 1;
    matcher: CatalogImageMatcher;
    matchLevel: CatalogImageTargetType;
    signals: readonly CatalogImageMatchSignal[];
  }>;
}>;

export type CreateCatalogImageCandidateResult = Readonly<{
  status: "created" | "duplicate";
  imageId: string;
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
