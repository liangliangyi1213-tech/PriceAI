/**
 * Browser-safe source validation for already-approved Catalog images.
 * Network-level DNS, SSRF, redirect, and socket pinning checks remain in the
 * server-only catalog-image-source and mirror-downloader layers.
 */
export type CatalogImageRenderSourcePolicy = Readonly<{
  platform: string;
  allowedHosts: readonly string[];
  allowedSourceKinds?: readonly string[];
}>;

export type CatalogImageRenderSourceRegistry = Readonly<{
  policies: readonly CatalogImageRenderSourcePolicy[];
}>;

const normalized = (value: string): string => value.trim().toLowerCase();

export const defaultCatalogImageRenderSourceRegistry: CatalogImageRenderSourceRegistry = {
  policies: [
    { platform: "taobao", allowedHosts: ["img.alicdn.com", "gw.alicdn.com", "ae01.alicdn.com"], allowedSourceKinds: ["pict_url", "small_images_0"] },
    { platform: "pdd", allowedHosts: ["img.pddpic.com", "funimg.pddpic.com"], allowedSourceKinds: ["goods_image_url", "goods_thumbnail_url"] },
  ],
};

function policyFor(platform: string, registry: CatalogImageRenderSourceRegistry): CatalogImageRenderSourcePolicy | null {
  return registry.policies.find((policy) => normalized(policy.platform) === normalized(platform)) ?? null;
}

export function isCatalogImageRenderSourceKindAllowed(
  platform: string,
  sourceKind: string,
  registry: CatalogImageRenderSourceRegistry = defaultCatalogImageRenderSourceRegistry,
): boolean {
  const policy = policyFor(platform, registry);
  return Boolean(policy?.allowedSourceKinds?.some((kind) => normalized(kind) === normalized(sourceKind)));
}

export function selectCatalogImageRenderSource(
  platform: string,
  value: string,
  registry: CatalogImageRenderSourceRegistry = defaultCatalogImageRenderSourceRegistry,
): string | null {
  const policy = policyFor(platform, registry);
  if (!policy) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = normalized(url.hostname);
    if (!policy.allowedHosts.some((allowed) => host === normalized(allowed))) return null;
    return url.href;
  } catch {
    return null;
  }
}
