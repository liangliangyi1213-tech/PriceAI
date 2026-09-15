import "server-only";

import { createHash } from "node:crypto";

import { getCatalogSyncWriteClient } from "@/lib/catalog-sync/write-client";

import type { MirrorContentType } from "./mirror-image-metadata";
import { asMirrorError, CatalogImageMirrorError } from "./mirror-service-types";

export const CATALOG_IMAGE_BUCKET = "catalog-images";

type InternalPathInput = Readonly<{
  productId: string;
  variantId: string | null;
  imageId: string;
  contentHash: string;
  extension: "jpg" | "png" | "webp";
}>;

const internalId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const sha256 = /^[a-f0-9]{64}$/;

export function buildCatalogMirrorObjectPath(input: InternalPathInput): string {
  if (![input.productId, input.imageId, ...(input.variantId ? [input.variantId] : [])].every((value) => internalId.test(value))
    || !sha256.test(input.contentHash)) throw new CatalogImageMirrorError("invalid_object_identity");
  const root = input.variantId
    ? `products/${input.productId}/variants/${input.variantId}/${input.imageId}`
    : `products/${input.productId}/${input.imageId}`;
  return `${root}/${input.contentHash}.${input.extension}`;
}

export type MirrorStorage = Readonly<{
  exists(path: string): Promise<boolean>;
  upload(input: Readonly<{ path: string; bytes: Uint8Array; contentType: MirrorContentType; upsert: false }>): Promise<"uploaded" | "conflict" | "failed">;
  download(path: string): Promise<Uint8Array>;
}>;

async function verifyExisting(path: string, contentHash: string, storage: MirrorStorage): Promise<void> {
  const existing = await storage.download(path);
  if (createHash("sha256").update(existing).digest("hex") !== contentHash) {
    throw new CatalogImageMirrorError("upload_failed");
  }
}

export async function storeCatalogMirror(
  input: Readonly<{ path: string; bytes: Uint8Array; contentHash: string; contentType: MirrorContentType }>,
  storage: MirrorStorage,
): Promise<Readonly<{ status: "uploaded" | "reused"; path: string }>> {
  try {
    if (await storage.exists(input.path)) {
      await verifyExisting(input.path, input.contentHash, storage);
      return { status: "reused", path: input.path };
    }
    const result = await storage.upload({ path: input.path, bytes: input.bytes, contentType: input.contentType, upsert: false });
    if (result === "uploaded") return { status: "uploaded", path: input.path };
    if (result === "conflict") {
      await verifyExisting(input.path, input.contentHash, storage);
      return { status: "reused", path: input.path };
    }
    throw new CatalogImageMirrorError("upload_failed");
  } catch (error) {
    throw asMirrorError(error, "upload_failed");
  }
}

function isConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  return value.status === 409 || value.statusCode === 409
    || ["Duplicate", "ResourceAlreadyExists", "409"].includes(String(value.error ?? value.code ?? ""));
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  const status = Number(value.status ?? value.statusCode);
  return status === 400 || status === 404;
}

export function createSupabaseMirrorStorage(): MirrorStorage {
  return {
    async exists(path) {
      const bucket = getCatalogSyncWriteClient().storage.from(CATALOG_IMAGE_BUCKET);
      const { data, error } = await bucket.exists(path);
      if (error && !(data === false && isMissingObject(error))) {
        throw new CatalogImageMirrorError("upload_failed");
      }
      return data;
    },
    async upload(input) {
      const bucket = getCatalogSyncWriteClient().storage.from(CATALOG_IMAGE_BUCKET);
      const { error } = await bucket.upload(input.path, input.bytes, {
        contentType: input.contentType,
        cacheControl: "31536000",
        upsert: false,
      });
      if (!error) return "uploaded";
      return isConflict(error) ? "conflict" : "failed";
    },
    async download(path) {
      const bucket = getCatalogSyncWriteClient().storage.from(CATALOG_IMAGE_BUCKET);
      const { data, error } = await bucket.download(path);
      if (error || !data) throw new CatalogImageMirrorError("upload_failed");
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
