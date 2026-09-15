import "server-only";

import { createHash } from "node:crypto";

import {
  defaultMirrorPolicyRegistry,
  resolveMirrorPolicy,
  type MirrorPolicyRegistry,
} from "./mirror-policy";
import { getCanonicalCatalogImageStoragePath } from "./storage-resolver";
import { SupabaseCatalogImageRepository } from "./repository";
import { createSupabaseMirrorStorage } from "./mirror-storage";
import type { CatalogImageMirrorContext } from "./mirror-service-types";

export const CATALOG_IMAGE_HEALTH_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type CatalogImageMirrorHealthStatus =
  | "healthy"
  | "missing_object"
  | "metadata_incomplete"
  | "metadata_invalid"
  | "hash_mismatch"
  | "stale_check"
  | "remote_only"
  | "never_mirrored";

export type CatalogImageMirrorHealth = Readonly<{
  status: CatalogImageMirrorHealthStatus;
  mirrored: boolean;
  bucket: "catalog-images" | null;
  lastCheckedAt: string | null;
}>;

export type CatalogImageMirrorHealthRepository = Readonly<{
  getMirrorContext(imageId: string): Promise<CatalogImageMirrorContext | null>;
  touchMirrorLastCheckedAt(input: Readonly<{
    imageId: string;
    storageBucket: string;
    storageObjectPath: string;
    checkedAt: string;
  }>): Promise<void>;
}>;

export type CatalogImageMirrorHealthStorage = Readonly<{
  exists(path: string): Promise<boolean>;
  download(path: string): Promise<Uint8Array>;
}>;

function hasAnyMirrorMetadata(image: CatalogImageMirrorContext["image"]): boolean {
  return [image.storageBucket, image.storageObjectPath, image.contentHash, image.contentType,
    image.width, image.height, image.mirroredAt, image.lastCheckedAt].some((value) => value !== null);
}

function hasCoreMirrorMetadata(image: CatalogImageMirrorContext["image"]): boolean {
  return image.storageBucket !== null && image.storageObjectPath !== null && image.contentHash !== null
    && image.contentType !== null && image.width !== null && image.height !== null && image.mirroredAt !== null;
}

function result(status: CatalogImageMirrorHealthStatus, mirrored: boolean, lastCheckedAt: string | null): CatalogImageMirrorHealth {
  return { status, mirrored, bucket: mirrored ? "catalog-images" : null, lastCheckedAt };
}

export function createCatalogImageMirrorHealthService(dependencies: Readonly<{
  repository: CatalogImageMirrorHealthRepository;
  storage: CatalogImageMirrorHealthStorage;
  registry?: MirrorPolicyRegistry;
  now?: () => Date;
  staleAfterMs?: number;
}>) {
  async function checkContext(context: CatalogImageMirrorContext, options: Readonly<{
    mode: "shallow" | "deep";
    updateLastCheckedAt?: boolean;
  }>): Promise<CatalogImageMirrorHealth> {
    const image = context.image;
    const policy = resolveMirrorPolicy(dependencies.registry ?? defaultMirrorPolicyRegistry, {
      platform: image.platform,
      category: context.category,
    });
    if (!hasAnyMirrorMetadata(image)) {
      return result(policy.mode === "remote_only" ? "remote_only" : "never_mirrored", false, null);
    }
    if (!hasCoreMirrorMetadata(image)) return result("metadata_incomplete", false, image.lastCheckedAt);
    if (image.lastCheckedAt !== null) {
      const lastCheckedAt = Date.parse(image.lastCheckedAt);
      if (!Number.isFinite(lastCheckedAt) || lastCheckedAt < Date.parse(image.mirroredAt!)) {
        return result("metadata_invalid", false, image.lastCheckedAt);
      }
    }
    const path = getCanonicalCatalogImageStoragePath(image);
    if (!path || !context.variantBelongsToProduct) {
      return result("metadata_invalid", false, image.lastCheckedAt);
    }

    const now = (dependencies.now ?? (() => new Date()))();
    const checkedAt = now.toISOString();
    const exists = await dependencies.storage.exists(path);
    if (options.updateLastCheckedAt) {
      await dependencies.repository.touchMirrorLastCheckedAt({
        imageId: image.id,
        storageBucket: image.storageBucket!,
        storageObjectPath: path,
        checkedAt,
      });
    }
    if (!exists) return result("missing_object", true, options.updateLastCheckedAt ? checkedAt : image.lastCheckedAt);
    if (options.mode === "deep") {
      const bytes = await dependencies.storage.download(path);
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== image.contentHash) {
        return result("hash_mismatch", true, options.updateLastCheckedAt ? checkedAt : image.lastCheckedAt);
      }
    }
    const staleAfterMs = dependencies.staleAfterMs ?? CATALOG_IMAGE_HEALTH_STALE_AFTER_MS;
    const lastChecked = image.lastCheckedAt ? Date.parse(image.lastCheckedAt) : Number.NaN;
    const wasStale = !Number.isFinite(lastChecked) || now.getTime() - lastChecked > staleAfterMs;
    return result(wasStale && !options.updateLastCheckedAt ? "stale_check" : "healthy", true,
      options.updateLastCheckedAt ? checkedAt : image.lastCheckedAt);
  }

  return {
    checkContext,
    async check(imageId: string, options: Readonly<{
      mode: "shallow" | "deep";
      updateLastCheckedAt?: boolean;
    }>): Promise<CatalogImageMirrorHealth> {
      const context = await dependencies.repository.getMirrorContext(imageId);
      if (!context) return result("never_mirrored", false, null);
      return checkContext(context, options);
    },
  };
}

const defaultHealthService = () => createCatalogImageMirrorHealthService({
  repository: new SupabaseCatalogImageRepository(),
  storage: createSupabaseMirrorStorage(),
});

export function checkCatalogImageMirrorHealth(
  imageId: string,
  options: Readonly<{ mode: "shallow" | "deep"; updateLastCheckedAt?: boolean }>,
): Promise<CatalogImageMirrorHealth> {
  return defaultHealthService().check(imageId, options);
}
