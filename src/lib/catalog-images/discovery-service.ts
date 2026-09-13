import "server-only";

import { getProducts } from "@/lib/catalog/repository";
import {
  searchCategoryIds,
  searchCategoryRegistry,
  type SearchMatcherId,
} from "@/lib/search/category-context";
import type { Product } from "@/types/catalog";

import {
  createCatalogImageCandidate,
  type CatalogImageCandidateMatch,
  type CatalogImageCandidateOutcome,
  type CatalogImageCandidateSource,
} from "./candidate-service";
import { getCatalogImageDiscoveryProviders } from "./discovery-providers";
import { SupabaseCatalogImageRepository } from "./repository";

export const MAX_CATALOG_IMAGE_DISCOVERY_PRODUCTS = 10;
export const MAX_CATALOG_IMAGE_CANDIDATES_PER_PLATFORM = 3;
export const MAX_CATALOG_IMAGE_DISCOVERY_CONCURRENCY = 2;
export const CATALOG_IMAGE_DISCOVERY_TIMEOUT_MS = 8_000;

export type CatalogImageDiscoveryInput = Readonly<{
  mode: "single" | "batch";
  productIds: readonly string[];
}>;

export type CatalogImageDiscoveryProvider = Readonly<{
  platform: "taobao" | "pdd";
  matcher: Exclude<SearchMatcherId, null>;
  discover(product: Product, signal: AbortSignal): Promise<readonly CatalogImageDiscoveryItem[]>;
}>;

export type CatalogImageDiscoveryItem = Readonly<{
  source: CatalogImageCandidateSource;
  match: CatalogImageCandidateMatch;
}>;

type DiscoveryCounts = Readonly<{
  created: number;
  duplicate: number;
  suppressed: number;
  skipped: number;
  rejected: number;
  failed: number;
}>;

type MutableCounts = { -readonly [Key in keyof DiscoveryCounts]: DiscoveryCounts[Key] };

export type CatalogImageDiscoveryProductReport = DiscoveryCounts & Readonly<{
  productRef: string;
  productName: string;
  status: "completed" | "partial" | "unsupported" | "not_found";
}>;

export type CatalogImageDiscoveryReport = Readonly<{
  summary: DiscoveryCounts;
  products: readonly CatalogImageDiscoveryProductReport[];
}>;

export type CatalogImageDiscoveryErrorCode = "invalid_input" | "batch_limit";

export class CatalogImageDiscoveryError extends Error {
  constructor(readonly code: CatalogImageDiscoveryErrorCode) {
    super("Catalog image discovery request is invalid.");
    this.name = "CatalogImageDiscoveryError";
  }
}

type Dependencies = Readonly<{
  loadProducts?: () => Promise<Product[]>;
  providers?: readonly CatalogImageDiscoveryProvider[];
  createCandidate?: typeof createCatalogImageCandidate;
  getActiveCandidateCount?: (productId: string, platform: CatalogImageDiscoveryProvider["platform"]) => Promise<number>;
  timeoutMs?: number;
}>;

type ProductAccumulator = {
  productRef: string;
  productName: string;
  status: CatalogImageDiscoveryProductReport["status"];
  counts: MutableCounts;
};

function emptyCounts(): MutableCounts {
  return { created: 0, duplicate: 0, suppressed: 0, skipped: 0, rejected: 0, failed: 0 };
}

export function maskCatalogProductId(productId: string): string {
  const value = productId.trim();
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}••${value.slice(-2)}`;
}

function matcherForProduct(product: Product): Exclude<SearchMatcherId, null> | null {
  for (const id of searchCategoryIds) {
    const config = searchCategoryRegistry[id];
    if (config.matcher && config.catalogCategories.includes(product.category)) return config.matcher;
  }
  return null;
}

function validateInput(input: CatalogImageDiscoveryInput): string[] {
  if (input.mode !== "single" && input.mode !== "batch") throw new CatalogImageDiscoveryError("invalid_input");
  if (input.productIds.length > MAX_CATALOG_IMAGE_DISCOVERY_PRODUCTS) {
    throw new CatalogImageDiscoveryError("batch_limit");
  }
  const ids = [...new Set(input.productIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0 || (input.mode === "single" && ids.length !== 1)) {
    throw new CatalogImageDiscoveryError("invalid_input");
  }
  return ids;
}

function increment(counts: MutableCounts, key: keyof DiscoveryCounts): void {
  counts[key] += 1;
}

function classifySkippedMatch(
  match: Exclude<CatalogImageCandidateMatch, { status: "matched" }>,
  counts: MutableCounts,
): void {
  increment(counts, match.status === "rejected" ? "rejected" : "skipped");
}

function applyOutcome(outcome: CatalogImageCandidateOutcome, counts: MutableCounts): void {
  if (outcome.status === "suppressed") {
    increment(counts, "suppressed");
    return;
  }
  if (outcome.status !== "skipped") {
    increment(counts, outcome.status);
    return;
  }
  increment(counts, outcome.reason === "rejected" || outcome.reason.startsWith("invalid_") ? "rejected" : "skipped");
}

async function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Catalog image discovery deadline exceeded"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runJobs(jobs: readonly (() => Promise<void>)[], concurrency: number): Promise<void> {
  let index = 0;
  async function worker(): Promise<void> {
    while (index < jobs.length) {
      const job = jobs[index];
      index += 1;
      await job();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
}

export async function runCatalogImageDiscovery(
  input: CatalogImageDiscoveryInput,
  dependencies: Dependencies = {},
): Promise<CatalogImageDiscoveryReport> {
  const productIds = validateInput(input);
  const allProducts = await (dependencies.loadProducts ?? getProducts)();
  const byId = new Map(allProducts.map((product) => [product.id, product]));
  const providers = dependencies.providers ?? getCatalogImageDiscoveryProviders();
  const createCandidate = dependencies.createCandidate ?? createCatalogImageCandidate;
  const imageRepository = new SupabaseCatalogImageRepository();
  const getActiveCandidateCount = dependencies.getActiveCandidateCount
    ?? (dependencies.createCandidate
      ? async () => 0
      : (productId: string, platform: CatalogImageDiscoveryProvider["platform"]) => (
        imageRepository.countActiveCandidates(productId, platform)
      ));
  const timeoutMs = dependencies.timeoutMs !== undefined && Number.isFinite(dependencies.timeoutMs)
    ? Math.max(1, Math.floor(dependencies.timeoutMs))
    : CATALOG_IMAGE_DISCOVERY_TIMEOUT_MS;
  const reports = new Map<string, ProductAccumulator>();
  const jobs: Array<() => Promise<void>> = [];

  for (const productId of productIds) {
    const product = byId.get(productId);
    const report: ProductAccumulator = {
      productRef: maskCatalogProductId(productId),
      productName: product?.name ?? "Catalog 商品",
      status: product ? "completed" : "not_found",
      counts: emptyCounts(),
    };
    reports.set(productId, report);
    if (!product) {
      increment(report.counts, "skipped");
      continue;
    }
    const matcher = matcherForProduct(product);
    const supported = matcher ? providers.filter((provider) => provider.matcher === matcher) : [];
    if (!matcher || supported.length === 0) {
      report.status = "unsupported";
      increment(report.counts, "skipped");
      continue;
    }

    for (const provider of supported) {
      jobs.push(async () => {
        try {
          const discovered = await withDeadline((signal) => provider.discover(product, signal), timeoutMs);
          const bounded = discovered.slice(0, MAX_CATALOG_IMAGE_CANDIDATES_PER_PLATFORM);
          let availableSlots = Math.max(
            0,
            MAX_CATALOG_IMAGE_CANDIDATES_PER_PLATFORM
              - await getActiveCandidateCount(product.id, provider.platform),
          );
          if (bounded.length === 0) increment(report.counts, "skipped");
          for (const item of bounded) {
            if (item.match.status !== "matched") {
              classifySkippedMatch(item.match, report.counts);
              continue;
            }
            if (item.match.product.id !== product.id) {
              increment(report.counts, "rejected");
              continue;
            }
            try {
              const outcome = await createCandidate(item, undefined, { allowCreate: availableSlots > 0 });
              applyOutcome(outcome, report.counts);
              if (outcome.status === "created") availableSlots -= 1;
            } catch {
              increment(report.counts, "failed");
            }
          }
        } catch {
          increment(report.counts, "failed");
        }
      });
    }
  }

  await runJobs(jobs, MAX_CATALOG_IMAGE_DISCOVERY_CONCURRENCY);
  const products = [...reports.values()].map((report): CatalogImageDiscoveryProductReport => {
    const status = report.status === "completed" && report.counts.failed > 0 ? "partial" : report.status;
    return { productRef: report.productRef, productName: report.productName, status, ...report.counts };
  });
  const summary = products.reduce<MutableCounts>((total, product) => {
    total.created += product.created;
    total.duplicate += product.duplicate;
    total.suppressed += product.suppressed;
    total.skipped += product.skipped;
    total.rejected += product.rejected;
    total.failed += product.failed;
    return total;
  }, emptyCounts());
  return { summary, products };
}

export async function getCatalogImageDiscoveryOptions(): Promise<Array<Readonly<{
  id: string;
  name: string;
  category: string;
  supported: boolean;
}>>> {
  const products = await getProducts();
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    supported: matcherForProduct(product) !== null,
  }));
}
