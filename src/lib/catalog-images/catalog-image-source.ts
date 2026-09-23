import { isIP } from "node:net";

import type { CatalogImageMatcher } from "./types";

export type CatalogImageSourcePolicy = Readonly<{
  platform: string;
  allowedHosts: readonly string[];
  allowedSourceKinds?: readonly string[];
  allowedMatchers?: readonly CatalogImageMatcher[];
}>;

export type CatalogImageSourceRegistry = Readonly<{
  policies: readonly CatalogImageSourcePolicy[];
}>;

export type CatalogImageSource = Readonly<{
  sourceKind: "catalog_primary";
  url: string;
}>;

const normalized = (value: string): string => value.trim().toLowerCase();

export const defaultCatalogImageSourceRegistry: CatalogImageSourceRegistry = {
  policies: [
    {
      platform: "taobao", allowedHosts: ["img.alicdn.com", "gw.alicdn.com", "ae01.alicdn.com"],
      allowedSourceKinds: ["pict_url", "small_images_0"],
      allowedMatchers: ["taobao_phone_strict", "catalog_sync_deterministic"],
    },
    {
      platform: "pdd", allowedHosts: ["img.pddpic.com", "funimg.pddpic.com"],
      allowedSourceKinds: ["goods_image_url", "goods_thumbnail_url"],
      allowedMatchers: ["pinduoduo_phone_strict", "catalog_sync_deterministic"],
    },
  ],
};

export function createCatalogImageSourceRegistry(
  policies: readonly CatalogImageSourcePolicy[],
): CatalogImageSourceRegistry {
  return { policies: [...policies] };
}

export function selectCatalogImageSource(
  platform: string,
  value: string,
  registry: CatalogImageSourceRegistry = defaultCatalogImageSourceRegistry,
): CatalogImageSource | null {
  const policy = registry.policies.find((entry) => normalized(entry.platform) === normalized(platform));
  if (!policy) return null;

  try {
    const url = new URL(value);
    const hostname = normalized(url.hostname);
    if (url.protocol !== "https:" || url.username || url.password || isIP(hostname)) return null;
    if (!policy.allowedHosts.some((host) => normalized(host) === hostname)) return null;
    return { sourceKind: "catalog_primary", url: url.href };
  } catch {
    return null;
  }
}

function sourcePolicyFor(platform: string, registry: CatalogImageSourceRegistry): CatalogImageSourcePolicy | null {
  return registry.policies.find((entry) => normalized(entry.platform) === normalized(platform)) ?? null;
}

export function isCatalogImageSourceKindAllowed(
  platform: string,
  sourceKind: string,
  registry: CatalogImageSourceRegistry = defaultCatalogImageSourceRegistry,
): boolean {
  const policy = sourcePolicyFor(platform, registry);
  return Boolean(policy?.allowedSourceKinds?.some((kind) => normalized(kind) === normalized(sourceKind)));
}

export function isCatalogImageMatcherAllowed(
  platform: string,
  matcher: CatalogImageMatcher,
  registry: CatalogImageSourceRegistry = defaultCatalogImageSourceRegistry,
): boolean {
  const policy = sourcePolicyFor(platform, registry);
  return Boolean(policy?.allowedMatchers?.includes(matcher));
}
