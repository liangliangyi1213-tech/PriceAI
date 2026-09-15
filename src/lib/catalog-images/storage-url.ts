export const CATALOG_IMAGE_BUCKET = "catalog-images";

const internalId = "[A-Za-z0-9][A-Za-z0-9_-]{0,127}";
const contentHash = "[a-f0-9]{64}";
const catalogObjectPath = new RegExp(
  `^products/${internalId}/(?:variants/${internalId}/)?${internalId}/${contentHash}\\.(?:jpg|png|webp)$`,
);

export function isCatalogImageStorageObjectPath(value: string): boolean {
  return catalogObjectPath.test(value);
}

export function isCatalogImageStoragePublicUrl(value: string, expectedObjectPath?: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return false;
  const prefix = `/storage/v1/object/public/${CATALOG_IMAGE_BUCKET}/`;
  if (!url.pathname.startsWith(prefix)) return false;
  const objectPath = url.pathname.slice(prefix.length);
  return isCatalogImageStorageObjectPath(objectPath)
    && (expectedObjectPath === undefined || objectPath === expectedObjectPath);
}
