import "server-only";

import { downloadMirrorSource } from "./mirror-downloader";
import { inspectMirrorImage } from "./mirror-image-metadata";
import {
  defaultMirrorPolicyRegistry,
  evaluateCatalogImageMirrorEligibility,
  type MirrorPolicyRegistry,
} from "./mirror-policy";
import { SupabaseCatalogImageRepository } from "./repository";
import {
  buildCatalogMirrorObjectPath,
  CATALOG_IMAGE_BUCKET,
  createSupabaseMirrorStorage,
  storeCatalogMirror,
  type MirrorStorage,
} from "./mirror-storage";
import {
  asMirrorError,
  CatalogImageMirrorError,
  type CatalogImageMirrorContext,
  type CatalogImageMirrorMetadataUpdate,
} from "./mirror-service-types";
import type { CatalogImage } from "./types";

export type CatalogImageMirrorRepository = Readonly<{
  getMirrorContext(imageId: string): Promise<CatalogImageMirrorContext | null>;
  updateMirrorMetadata(input: CatalogImageMirrorMetadataUpdate): Promise<void>;
}>;

type MirrorDependencies = Readonly<{
  repository: CatalogImageMirrorRepository;
  storage: MirrorStorage;
  registry: MirrorPolicyRegistry;
  download: typeof downloadMirrorSource;
  now: () => Date;
}>;

function sameSourceIdentity(before: CatalogImage, after: CatalogImage): boolean {
  return before.id === after.id
    && before.productId === after.productId
    && before.variantId === after.variantId
    && before.targetType === after.targetType
    && before.platform === after.platform
    && before.sourceUrlHash === after.sourceUrlHash;
}

export function createCatalogImageMirrorService(dependencies: MirrorDependencies) {
  return {
    async mirror(catalogImageId: string) {
      const imageId = catalogImageId.trim();
      if (!imageId) throw new CatalogImageMirrorError("image_not_found");
      let context: CatalogImageMirrorContext | null;
      try { context = await dependencies.repository.getMirrorContext(imageId); }
      catch { throw new CatalogImageMirrorError("repository_unavailable"); }
      if (!context) throw new CatalogImageMirrorError("image_not_found");
      if (!context.variantBelongsToProduct) throw new CatalogImageMirrorError("target_mismatch");
      const eligibility = evaluateCatalogImageMirrorEligibility({
        image: {
          kind: "catalog_image",
          productId: context.image.productId,
          variantId: context.image.variantId,
          targetType: context.image.targetType,
          status: context.image.status,
          role: context.image.role,
          isPrimary: context.image.role === "primary",
          platform: context.image.platform,
          sourceUrl: context.image.sourceUrl,
        },
        category: context.category,
      }, dependencies.registry);
      if (!eligibility.eligible) {
        const code = eligibility.reason === "not_catalog_image" || eligibility.reason === "eligible"
          ? "invalid_source"
          : eligibility.reason;
        throw new CatalogImageMirrorError(code);
      }
      if (eligibility.policy.transform !== "preserve") {
        throw new CatalogImageMirrorError("unsupported_transform");
      }

      const downloaded = await dependencies.download({
        url: context.image.sourceUrl,
        platform: context.image.platform,
        policy: eligibility.policy,
      });
      const inspected = inspectMirrorImage(downloaded.bytes, downloaded.headerContentType, eligibility.policy);
      const path = buildCatalogMirrorObjectPath({
        productId: context.image.productId,
        variantId: context.image.variantId,
        imageId: context.image.id,
        contentHash: inspected.contentHash,
        extension: inspected.extension,
      });
      const stored = await storeCatalogMirror({
        path,
        bytes: inspected.bytes,
        contentHash: inspected.contentHash,
        contentType: inspected.contentType,
      }, dependencies.storage);

      let current: CatalogImageMirrorContext | null;
      try { current = await dependencies.repository.getMirrorContext(imageId); }
      catch { throw new CatalogImageMirrorError("metadata_update_failed"); }
      if (!current || !sameSourceIdentity(context.image, current.image)) {
        throw new CatalogImageMirrorError("metadata_update_failed");
      }
      const now = dependencies.now().toISOString();
      try {
        await dependencies.repository.updateMirrorMetadata({
          imageId,
          expectedProductId: context.image.productId,
          expectedVariantId: context.image.variantId,
          expectedTargetType: context.image.targetType,
          expectedPlatform: context.image.platform,
          expectedSourceUrlHash: context.image.sourceUrlHash,
          storageBucket: CATALOG_IMAGE_BUCKET,
          storageObjectPath: path,
          contentHash: inspected.contentHash,
          contentType: inspected.contentType,
          width: inspected.width,
          height: inspected.height,
          mirroredAt: now,
          lastCheckedAt: now,
        });
      } catch (error) {
        throw asMirrorError(error, "metadata_update_failed");
      }
      return {
        status: "mirrored" as const,
        storageStatus: stored.status,
        contentHash: inspected.contentHash,
        storageBucket: CATALOG_IMAGE_BUCKET,
        storageObjectPath: path,
      };
    },
  };
}

export async function mirrorCatalogImage(catalogImageId: string) {
  const repository = new SupabaseCatalogImageRepository();
  return createCatalogImageMirrorService({
    repository,
    storage: createSupabaseMirrorStorage(),
    registry: defaultMirrorPolicyRegistry,
    download: downloadMirrorSource,
    now: () => new Date(),
  }).mirror(catalogImageId);
}
