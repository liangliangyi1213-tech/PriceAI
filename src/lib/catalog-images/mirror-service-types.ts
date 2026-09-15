import type { CatalogImage } from "./types";

export type CatalogImageMirrorErrorCode =
  | "image_not_found"
  | "repository_unavailable"
  | "not_approved"
  | "not_primary"
  | "target_mismatch"
  | "policy_remote_only"
  | "unsupported_transform"
  | "invalid_source"
  | "dns_blocked"
  | "redirect_blocked"
  | "timeout"
  | "download_failed"
  | "response_too_large"
  | "unsupported_mime"
  | "magic_mismatch"
  | "invalid_dimensions"
  | "pixel_limit_exceeded"
  | "invalid_object_identity"
  | "upload_failed"
  | "metadata_update_failed";

/** A deliberately detail-free error safe to handle outside the mirror subsystem. */
export class CatalogImageMirrorError extends Error {
  readonly code: CatalogImageMirrorErrorCode;

  constructor(code: CatalogImageMirrorErrorCode) {
    super(code);
    this.name = "CatalogImageMirrorError";
    this.code = code;
  }
}

export function asMirrorError(error: unknown, fallback: CatalogImageMirrorErrorCode): CatalogImageMirrorError {
  return error instanceof CatalogImageMirrorError ? error : new CatalogImageMirrorError(fallback);
}

export type CatalogImageMirrorContext = Readonly<{
  image: CatalogImage;
  category: string;
  variantBelongsToProduct: boolean;
}>;

export type CatalogImageMirrorMetadataUpdate = Readonly<{
  imageId: string;
  expectedProductId: string;
  expectedVariantId: string | null;
  expectedTargetType: "product" | "variant";
  expectedPlatform: string;
  expectedSourceUrlHash: string;
  storageBucket: string;
  storageObjectPath: string;
  contentHash: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  mirroredAt: string;
  lastCheckedAt: string;
}>;
