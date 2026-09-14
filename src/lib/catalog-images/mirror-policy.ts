import { selectProviderImageSource, type LiveImagePlatform } from "@/lib/images/live-listing-image";

export type MirrorPolicyMode = "remote_only" | "mirror_allowed";
export type MirrorTransform = "preserve" | "normalize_webp";

export type MirrorPolicy = Readonly<{
  platform: string;
  category?: string;
  mode: MirrorPolicyMode;
  allowedMimeTypes: readonly string[];
  maxDownloadBytes: number;
  maxDecodedPixels: number;
  transform: MirrorTransform;
  policyVersion: number;
  authorizationBasis?: string;
}>;

export type MirrorPolicyRegistry = Readonly<{
  policies: readonly MirrorPolicy[];
}>;

export type CatalogImageMirrorFacts = Readonly<{
  kind: "catalog_image";
  productId: string;
  variantId: string | null;
  targetType: "product" | "variant";
  status: "candidate" | "approved" | "rejected" | "unavailable";
  role: "primary" | "gallery";
  isPrimary: boolean;
  platform: string;
  sourceUrl: string;
}>;

export type CatalogImageMirrorEligibilityReason =
  | "eligible"
  | "not_catalog_image"
  | "not_approved"
  | "not_primary"
  | "target_mismatch"
  | "invalid_source"
  | "policy_remote_only";

export type CatalogImageMirrorEligibility = Readonly<{
  eligible: boolean;
  reason: CatalogImageMirrorEligibilityReason;
  policy: MirrorPolicy;
}>;

const remoteOnlyPolicy = (platform: string): MirrorPolicy => ({
  platform,
  mode: "remote_only",
  allowedMimeTypes: [],
  maxDownloadBytes: 0,
  maxDecodedPixels: 0,
  transform: "preserve",
  policyVersion: 1,
});

export const defaultMirrorPolicyRegistry: MirrorPolicyRegistry = {
  policies: [remoteOnlyPolicy("taobao"), remoteOnlyPolicy("pdd")],
};

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function createMirrorPolicyRegistry(policies: readonly MirrorPolicy[]): MirrorPolicyRegistry {
  return { policies: [...policies] };
}

export function resolveMirrorPolicy(
  registry: MirrorPolicyRegistry,
  input: Readonly<{ platform: string; category?: string }>,
): MirrorPolicy {
  const platform = normalized(input.platform) || "unknown";
  const category = normalized(input.category);
  const categoryPolicy = category
    ? registry.policies.find((policy) => normalized(policy.platform) === platform
      && normalized(policy.category) === category)
    : undefined;
  if (categoryPolicy) return categoryPolicy;
  return registry.policies.find((policy) => normalized(policy.platform) === platform
    && !normalized(policy.category)) ?? remoteOnlyPolicy(platform);
}

function liveImagePlatform(platform: string): LiveImagePlatform | null {
  const value = normalized(platform);
  if (value === "taobao") return "taobao";
  if (value === "pdd" || value === "pinduoduo") return "pinduoduo";
  return null;
}

function isCatalogImageMirrorFacts(value: unknown): value is CatalogImageMirrorFacts {
  return typeof value === "object" && value !== null
    && (value as { kind?: unknown }).kind === "catalog_image";
}

export function evaluateCatalogImageMirrorEligibility(
  input: Readonly<{ image: CatalogImageMirrorFacts; category?: string }>,
  registry: MirrorPolicyRegistry = defaultMirrorPolicyRegistry,
): CatalogImageMirrorEligibility {
  const image: unknown = input?.image;
  const policy = resolveMirrorPolicy(registry, {
    platform: isCatalogImageMirrorFacts(image) ? image.platform : "unknown",
    category: input?.category,
  });
  if (!isCatalogImageMirrorFacts(image)) return { eligible: false, reason: "not_catalog_image", policy };
  if (image.status !== "approved") return { eligible: false, reason: "not_approved", policy };
  if (image.role !== "primary" || !image.isPrimary) return { eligible: false, reason: "not_primary", policy };
  const targetMatches = image.targetType === "product"
    ? image.variantId === null
    : typeof image.variantId === "string" && image.variantId.trim().length > 0;
  if (!image.productId.trim() || !targetMatches) return { eligible: false, reason: "target_mismatch", policy };
  const provider = liveImagePlatform(image.platform);
  const source = provider
    ? selectProviderImageSource(provider, [{ kind: "catalog_primary", url: image.sourceUrl }])
    : null;
  if (!source) return { eligible: false, reason: "invalid_source", policy };
  if (policy.mode !== "mirror_allowed") return { eligible: false, reason: "policy_remote_only", policy };
  return { eligible: true, reason: "eligible", policy };
}
