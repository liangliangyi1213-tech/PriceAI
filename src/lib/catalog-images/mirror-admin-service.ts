import "server-only";

import { searchCategoryIds, searchCategoryRegistry } from "@/lib/search/category-context";

import {
  CATALOG_IMAGE_HEALTH_STALE_AFTER_MS,
  createCatalogImageMirrorHealthService,
  type CatalogImageMirrorHealth,
} from "./mirror-health";
import { MIRROR_JOB_MAX_ATTEMPTS, MIRROR_JOB_PROCESSING_TIMEOUT_MS } from "./mirror-job-retry";
import type { CatalogImageMirrorJob } from "./mirror-job-types";
import { createSupabaseMirrorStorage } from "./mirror-storage";
import type { CatalogImage } from "./types";
import { SupabaseCatalogImageMirrorAdminRepository } from "./mirror-admin-repository";
import { SupabaseCatalogImageRepository } from "./repository";

export type CatalogImageMirrorAdminSource = Readonly<{
  images: readonly Readonly<{
    image: CatalogImage;
    category: string;
    productName: string;
    variantLabel: string | null;
    variantBelongsToProduct?: boolean;
  }>[];
  jobs: readonly CatalogImageMirrorJob[];
}>;

export type CatalogImageMirrorAdminOverview = Readonly<{
  items: readonly Readonly<{
    imageId: string;
    productName: string;
    category: string;
    targetLabel: string;
    platform: string;
    mirrored: boolean;
    bucket: "catalog-images" | null;
    healthStatus: CatalogImageMirrorHealth["status"];
    lastCheckedAt: string | null;
    job: null | Readonly<{
      status: CatalogImageMirrorJob["status"];
      attemptCount: number;
      lastErrorCode: string | null;
      leaseExpired: boolean;
      retryDue: boolean;
      nearAttemptLimit: boolean;
    }>;
  }>[];
}>;

function categoryLabel(category: string): string {
  return searchCategoryIds.filter((id) => id !== "all")
    .map((id) => searchCategoryRegistry[id])
    .find((config) => config.catalogCategories.includes(category))?.label ?? category;
}

function platformLabel(platform: string): string {
  if (platform === "taobao") return "淘宝";
  if (platform === "pdd") return "拼多多";
  return platform;
}

export function buildCatalogImageMirrorAdminOverview(
  source: CatalogImageMirrorAdminSource,
  healthResults: readonly Readonly<{ imageId: string; health: CatalogImageMirrorHealth }>[],
  now = new Date(),
): CatalogImageMirrorAdminOverview {
  const healthByImage = new Map(healthResults.map((entry) => [entry.imageId, entry.health]));
  return {
    items: source.images.flatMap((entry) => {
      const health = healthByImage.get(entry.image.id);
      if (!health) return [];
      const latestJob = source.jobs.filter((job) => job.imageId === entry.image.id)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
      const startedAt = latestJob?.startedAt ? Date.parse(latestJob.startedAt) : Number.NaN;
      const nextAttemptAt = latestJob?.nextAttemptAt ? Date.parse(latestJob.nextAttemptAt) : Number.NaN;
      return [{
        imageId: entry.image.id,
        productName: entry.productName,
        category: categoryLabel(entry.category),
        targetLabel: entry.image.targetType === "product"
          ? "Product-level"
          : `Variant-level · ${entry.variantLabel ?? "具体 Variant"}`,
        platform: platformLabel(entry.image.platform),
        mirrored: health.mirrored,
        bucket: health.bucket,
        healthStatus: health.status,
        lastCheckedAt: health.lastCheckedAt,
        job: latestJob ? {
          status: latestJob.status,
          attemptCount: latestJob.attemptCount,
          lastErrorCode: latestJob.lastErrorCode,
          leaseExpired: latestJob.status === "processing" && Number.isFinite(startedAt)
            && now.getTime() - startedAt > MIRROR_JOB_PROCESSING_TIMEOUT_MS,
          retryDue: latestJob.status === "retry_wait" && Number.isFinite(nextAttemptAt)
            && nextAttemptAt <= now.getTime(),
          nearAttemptLimit: latestJob.attemptCount >= MIRROR_JOB_MAX_ATTEMPTS - 1,
        } : null,
      }];
    }),
  };
}

type MirrorAdminRepository = Readonly<{ load(): Promise<CatalogImageMirrorAdminSource> }>;
type MirrorHealthReader = Readonly<{
  checkContext(context: Readonly<{
    image: CatalogImage;
    category: string;
    variantBelongsToProduct: boolean;
  }>, options: Readonly<{ mode: "shallow" | "deep"; updateLastCheckedAt?: boolean }>): Promise<CatalogImageMirrorHealth>;
}>;

export async function getCatalogImageMirrorAdminOverview(
  repository: MirrorAdminRepository = new SupabaseCatalogImageMirrorAdminRepository(),
  health: MirrorHealthReader = createCatalogImageMirrorHealthService({
    repository: new SupabaseCatalogImageRepository(),
    storage: createSupabaseMirrorStorage(),
    staleAfterMs: CATALOG_IMAGE_HEALTH_STALE_AFTER_MS,
  }),
  now: () => Date = () => new Date(),
): Promise<CatalogImageMirrorAdminOverview> {
  const source = await repository.load();
  const healthResults = await Promise.all(source.images.map(async (entry) => ({
    imageId: entry.image.id,
    health: await health.checkContext({
      image: entry.image,
      category: entry.category,
      variantBelongsToProduct: entry.variantBelongsToProduct ?? true,
    }, { mode: "shallow", updateLastCheckedAt: false }),
  })));
  return buildCatalogImageMirrorAdminOverview(source, healthResults, now());
}
