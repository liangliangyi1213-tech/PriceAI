import "server-only";

import { getCatalogSyncWriteClient } from "@/lib/catalog-sync/write-client";
import type {
  ProductImageMirrorJobRow,
  ProductImagePrimaryEventRow,
  ProductImageRow,
} from "@/lib/supabase/database.types";

import { CATALOG_IMAGE_BUCKET } from "./storage-url";
import type { CatalogImageGcSnapshot, CatalogImageStorageInventoryObject } from "./deferred-gc";
import { CatalogImageRepositoryError } from "./repository";

const STORAGE_LIST_LIMIT = 1000;
const STORAGE_MAX_DEPTH = 8;
const STORAGE_MAX_OBJECTS = 10_000;

async function listCatalogStorageObjects(): Promise<CatalogImageStorageInventoryObject[]> {
  const bucket = getCatalogSyncWriteClient().storage.from(CATALOG_IMAGE_BUCKET);
  const objects: CatalogImageStorageInventoryObject[] = [];
  async function walk(prefix: string, depth: number): Promise<void> {
    if (depth > STORAGE_MAX_DEPTH || objects.length >= STORAGE_MAX_OBJECTS) return;
    for (let offset = 0; objects.length < STORAGE_MAX_OBJECTS; offset += STORAGE_LIST_LIMIT) {
      const { data, error } = await bucket.list(prefix, {
        limit: STORAGE_LIST_LIMIT,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${prefix}/${entry.name}`;
        if (!entry.id && !entry.metadata) await walk(path, depth + 1);
        else if (typeof entry.created_at === "string") {
          objects.push({ bucket: CATALOG_IMAGE_BUCKET, path, createdAt: entry.created_at });
        }
        if (objects.length >= STORAGE_MAX_OBJECTS) break;
      }
      if (entries.length < STORAGE_LIST_LIMIT) break;
    }
  }
  await walk("products", 1);
  return objects;
}

export class SupabaseCatalogImageDeferredGcRepository {
  async load(): Promise<CatalogImageGcSnapshot> {
    try {
      const client = getCatalogSyncWriteClient();
      const [objects, imagesResult, eventsResult, jobsResult] = await Promise.all([
        listCatalogStorageObjects(),
        client.from("product_images").select("id, status, is_primary, storage_bucket, storage_object_path"),
        client.from("product_image_primary_events").select("previous_image_id, new_image_id"),
        client.from("product_image_mirror_jobs").select("image_id, status")
          .in("status", ["pending", "processing", "retry_wait"]),
      ]);
      if (imagesResult.error || eventsResult.error || jobsResult.error) {
        throw imagesResult.error || eventsResult.error || jobsResult.error;
      }
      const images = (imagesResult.data ?? []) as Pick<ProductImageRow,
        "id" | "status" | "is_primary" | "storage_bucket" | "storage_object_path">[];
      const events = (eventsResult.data ?? []) as Pick<ProductImagePrimaryEventRow,
        "previous_image_id" | "new_image_id">[];
      const jobs = (jobsResult.data ?? []) as Pick<ProductImageMirrorJobRow, "image_id" | "status">[];
      return {
        objects,
        imageReferences: images.flatMap((image) => image.storage_bucket && image.storage_object_path ? [{
          imageId: image.id,
          bucket: image.storage_bucket,
          path: image.storage_object_path,
          status: image.status,
          isPrimary: image.is_primary,
        }] : []),
        primaryImageIds: images.filter((image) => image.is_primary).map((image) => image.id),
        eventImageIds: [...new Set(events.flatMap((event) =>
          [event.previous_image_id, event.new_image_id].filter((id): id is string => typeof id === "string"),
        ))],
        activeJobs: jobs.map((job) => ({ imageId: job.image_id, status: job.status })),
      };
    } catch (error) {
      if (error instanceof CatalogImageRepositoryError) throw error;
      throw new CatalogImageRepositoryError();
    }
  }
}
