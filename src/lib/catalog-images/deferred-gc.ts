import { CATALOG_IMAGE_BUCKET, parseCatalogImageStorageObjectPath } from "./storage-url";

export const CATALOG_IMAGE_GC_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type CatalogImageStorageInventoryObject = Readonly<{ bucket: string; path: string; createdAt: string }>;
export type CatalogImageGcImageReference = Readonly<{
  imageId: string;
  bucket: string;
  path: string;
  status: "candidate" | "approved" | "rejected" | "unavailable";
  isPrimary: boolean;
}>;
export type CatalogImageGcJobReference = Readonly<{
  imageId: string;
  status: "pending" | "processing" | "succeeded" | "retry_wait" | "permanently_failed" | "cancelled";
}>;

export type CatalogImageGcCandidate = Readonly<{
  bucket: "catalog-images";
  objectRef: string;
  ageDays: number;
}>;

export type CatalogImageGcSnapshot = Readonly<{
  objects: readonly CatalogImageStorageInventoryObject[];
  imageReferences: readonly CatalogImageGcImageReference[];
  primaryImageIds: readonly string[];
  eventImageIds: readonly string[];
  activeJobs: readonly CatalogImageGcJobReference[];
}>;

function maskInternalId(value: string): string {
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}•••${value.slice(-2)}`;
}

export function analyzeDeferredCatalogImageGc(input: Readonly<{
  objects: readonly CatalogImageStorageInventoryObject[];
  imageReferences: readonly CatalogImageGcImageReference[];
  primaryImageIds: readonly string[];
  eventImageIds: readonly string[];
  activeJobs: readonly CatalogImageGcJobReference[];
  now: Date;
  retentionMs?: number;
}>): CatalogImageGcCandidate[] {
  const retentionMs = input.retentionMs ?? CATALOG_IMAGE_GC_RETENTION_MS;
  const referencedPaths = new Set(input.imageReferences.map((reference) => `${reference.bucket}\u0000${reference.path}`));
  const protectedImageIds = new Set([
    ...input.primaryImageIds,
    ...input.eventImageIds,
    ...input.activeJobs
      .filter((job) => job.status === "pending" || job.status === "processing" || job.status === "retry_wait")
      .map((job) => job.imageId),
  ]);
  return input.objects.flatMap((object): CatalogImageGcCandidate[] => {
    if (object.bucket !== CATALOG_IMAGE_BUCKET || referencedPaths.has(`${object.bucket}\u0000${object.path}`)) return [];
    const identity = parseCatalogImageStorageObjectPath(object.path);
    const createdAt = Date.parse(object.createdAt);
    if (!identity || !Number.isFinite(createdAt) || input.now.getTime() - createdAt < retentionMs
      || protectedImageIds.has(identity.imageId)) return [];
    return [{
      bucket: CATALOG_IMAGE_BUCKET,
      objectRef: maskInternalId(identity.imageId),
      ageDays: Math.floor((input.now.getTime() - createdAt) / (24 * 60 * 60 * 1000)),
    }];
  });
}
