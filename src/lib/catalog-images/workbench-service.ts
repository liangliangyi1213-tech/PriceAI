import "server-only";

import { selectProviderImageSource, type LiveImagePlatform } from "@/lib/images/live-listing-image";
import { searchCategoryIds, searchCategoryRegistry } from "@/lib/search/category-context";

import {
  SupabaseCatalogImageWorkbenchRepository,
  type CatalogImageWorkbenchSource,
} from "./workbench-repository";
import type { CatalogImage, CatalogImagePrimaryEvent, CatalogImageTargetType } from "./types";
import { analyzeCatalogImageCandidateOverCap } from "./over-cap-governance";

export type CatalogImageWorkbenchEvent = Readonly<{
  action: CatalogImagePrimaryEvent["action"];
  changedBy: string;
  createdAt: string;
}>;

export type CatalogImageWorkbenchPrimary = Readonly<{
  platform: string;
  imagePlatform: LiveImagePlatform | null;
  imageUrl: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
}>;

export type CatalogImageWorkbenchCandidate = Readonly<{
  imageId: string;
  productName: string;
  category: string;
  targetType: CatalogImageTargetType;
  targetLabel: string;
  platform: string;
  imagePlatform: LiveImagePlatform | null;
  imageUrl: string | null;
  matchConfidence: string;
  externalProductId: string;
  evidence: Readonly<{ matcher: string; matchLevel: CatalogImageTargetType | "unknown"; signals: string[] }>;
  firstSeenAt: string;
  lastSeenAt: string;
  currentPrimary: CatalogImageWorkbenchPrimary | null;
  events: CatalogImageWorkbenchEvent[];
}>;

export type CatalogImageWorkbenchOverCapScope = Readonly<{
  productId: string;
  productName: string;
  platform: string;
  platformLabel: string;
  activeCount: number;
  suggestedCleanupCount: number;
}>;

export type CatalogImageWorkbench = Readonly<{
  candidates: CatalogImageWorkbenchCandidate[];
  overCapScopes: CatalogImageWorkbenchOverCapScope[];
}>;

function categoryLabel(category: string): string {
  return searchCategoryIds
    .filter((id) => id !== "all")
    .map((id) => searchCategoryRegistry[id])
    .find((config) => config.catalogCategories.includes(category))?.label ?? category;
}

function platformDetails(platform: string): { label: string; imagePlatform: LiveImagePlatform | null } {
  if (platform === "taobao") return { label: "淘宝", imagePlatform: "taobao" };
  if (platform === "pdd") return { label: "拼多多", imagePlatform: "pinduoduo" };
  return { label: platform, imagePlatform: null };
}

function safeImageUrl(image: CatalogImage): { url: string; platform: LiveImagePlatform } | null {
  const platform = platformDetails(image.platform).imagePlatform;
  if (!platform) return null;
  const source = selectProviderImageSource(platform, [{ kind: image.sourceKind, url: image.sourceUrl }]);
  return source ? { url: source.url, platform } : null;
}

function maskExternalProductId(value: string): string {
  const id = value.trim();
  if (id.length <= 4) return "••••";
  if (id.length <= 8) return `${id.slice(0, 1)}••••${id.slice(-2)}`;
  return `${id.slice(0, 2)}••••${id.slice(-4)}`;
}

function safeEvidence(image: CatalogImage): CatalogImageWorkbenchCandidate["evidence"] {
  const evidence = image.matchEvidence;
  const matchLevel = evidence?.matchLevel === "product" || evidence?.matchLevel === "variant"
    ? evidence.matchLevel
    : "unknown";
  return {
    matcher: typeof evidence?.matcher === "string" ? evidence.matcher.slice(0, 80) : "未记录",
    matchLevel,
    signals: Array.isArray(evidence?.signals)
      ? evidence.signals.filter((signal): signal is string => typeof signal === "string").slice(0, 8)
      : [],
  };
}

function sameTarget(image: CatalogImage | CatalogImagePrimaryEvent, target: CatalogImage): boolean {
  return image.productId === target.productId
    && image.targetType === target.targetType
    && image.variantId === target.variantId;
}

export function buildCatalogImageWorkbench(source: CatalogImageWorkbenchSource): CatalogImageWorkbench {
  const products = new Map(source.products.map((product) => [product.id, product]));
  const variants = new Map(source.variants.map((variant) => [variant.id, variant]));
  const validCandidates = source.candidates.filter((candidate) => {
    if (candidate.status !== "candidate") return false;
    const product = products.get(candidate.productId);
    const variant = candidate.variantId ? variants.get(candidate.variantId) : null;
    return Boolean(product)
      && (candidate.targetType === "product") === (candidate.variantId === null)
      && (!variant || variant.productId === candidate.productId)
      && (!candidate.variantId || Boolean(variant));
  });
  const groups = new Map<string, CatalogImage[]>();
  for (const candidate of validCandidates) {
    const key = `${candidate.productId}\u0000${candidate.platform}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return {
    candidates: validCandidates.flatMap((candidate) => {
      const product = products.get(candidate.productId);
      const variant = candidate.variantId ? variants.get(candidate.variantId) : null;
      if (!product) return [];
      const candidateImage = safeImageUrl(candidate);
      const current = source.primaries.find((primary) => sameTarget(primary, candidate));
      const currentImage = current ? safeImageUrl(current) : null;
      const platform = platformDetails(candidate.platform);
      return [{
        imageId: candidate.id,
        productName: product.name,
        category: categoryLabel(product.category),
        targetType: candidate.targetType,
        targetLabel: candidate.targetType === "product" ? "Product-level" : `Variant-level · ${variant?.label}`,
        platform: platform.label,
        imagePlatform: candidateImage?.platform ?? null,
        imageUrl: candidateImage?.url ?? null,
        matchConfidence: candidate.matchConfidence === null ? "暂无" : `${(candidate.matchConfidence * 100).toFixed(1)}%`,
        externalProductId: maskExternalProductId(candidate.externalProductId),
        evidence: safeEvidence(candidate),
        firstSeenAt: candidate.firstSeenAt,
        lastSeenAt: candidate.lastSeenAt,
        currentPrimary: current ? {
          platform: platformDetails(current.platform).label,
          imagePlatform: currentImage?.platform ?? null,
          imageUrl: currentImage?.url ?? null,
          verifiedAt: current.verifiedAt,
          verifiedBy: current.verifiedBy,
        } : null,
        events: source.events.filter((event) => sameTarget(event, candidate)).map((event) => ({
          action: event.action,
          changedBy: event.changedBy,
          createdAt: event.createdAt,
        })),
      }];
    }),
    overCapScopes: [...groups.values()].flatMap((images) => {
      const first = images[0];
      const product = first ? products.get(first.productId) : null;
      if (!first || !product) return [];
      const report = analyzeCatalogImageCandidateOverCap(images, {
        productId: first.productId,
        platform: first.platform,
      });
      return report.suggestedCleanupCount > 0 ? [{
        productId: first.productId,
        productName: product.name,
        platform: first.platform,
        platformLabel: platformDetails(first.platform).label,
        activeCount: report.activeCount,
        suggestedCleanupCount: report.suggestedCleanupCount,
      }] : [];
    }),
  };
}

export async function getCatalogImageWorkbench(
  repository: Pick<SupabaseCatalogImageWorkbenchRepository, "load"> = new SupabaseCatalogImageWorkbenchRepository(),
): Promise<CatalogImageWorkbench> {
  return buildCatalogImageWorkbench(await repository.load());
}
