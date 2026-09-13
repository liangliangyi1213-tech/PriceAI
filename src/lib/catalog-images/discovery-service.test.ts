import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { phones } from "@/data/phones";
import type { CatalogImageCandidateOutcome } from "./candidate-service";
import {
  CatalogImageDiscoveryError,
  MAX_CATALOG_IMAGE_DISCOVERY_PRODUCTS,
  runCatalogImageDiscovery,
  type CatalogImageDiscoveryItem,
  type CatalogImageDiscoveryProvider,
} from "./discovery-service";

const xiaomi = phones.find((product) => product.slug === "xiaomi-15")!;
const iphone = phones.find((product) => product.slug === "apple-iphone-16-pro")!;

function provider(
  platform: "taobao" | "pdd",
  discover: CatalogImageDiscoveryProvider["discover"],
): CatalogImageDiscoveryProvider {
  return { platform, matcher: "phone", discover };
}

function matched(product: typeof xiaomi, platform: "taobao" | "pdd" = "taobao", identity = "item-1"): CatalogImageDiscoveryItem {
  return {
    source: platform === "taobao"
      ? { platform: "taobao", listing: { itemId: identity } as never }
      : { platform: "pinduoduo", listing: { goodsId: identity } as never },
    match: {
      status: "matched", product, matchConfidence: 1,
      evidence: { matcher: platform === "taobao" ? "taobao_phone_strict" : "pinduoduo_phone_strict", signals: ["brand", "model"] },
    },
  };
}

describe("catalog image discovery service", () => {
  const createCandidate = vi.fn<() => Promise<CatalogImageCandidateOutcome>>();

  beforeEach(() => {
    vi.clearAllMocks();
    createCandidate.mockResolvedValue({ status: "created", imageId: "image-1" });
  });

  it("passes only discovered match outcomes through the existing Candidate service", async () => {
    const discover = vi.fn().mockResolvedValue([
      matched(xiaomi, "taobao", "matched"),
      { source: { platform: "taobao", listing: { itemId: "ambiguous" } }, match: { status: "ambiguous" } },
      { source: { platform: "taobao", listing: { itemId: "unmatched" } }, match: { status: "unmatched" } },
    ]);
    const rejected = vi.fn().mockResolvedValue([
      { source: { platform: "pinduoduo", listing: { goodsId: "rejected" } }, match: { status: "rejected" } },
    ]);
    createCandidate.mockResolvedValueOnce({ status: "created", imageId: "image-1" });

    const report = await runCatalogImageDiscovery({ mode: "single", productIds: [xiaomi.id] }, {
      loadProducts: async () => [xiaomi],
      providers: [provider("taobao", discover), provider("pdd", rejected)],
      createCandidate,
    });

    expect(createCandidate).toHaveBeenCalledTimes(1);
    expect(report.summary).toEqual({ created: 1, duplicate: 0, skipped: 2, rejected: 1, failed: 0 });
    expect(report.products[0]).toMatchObject({ productRef: "xi••15", productName: "小米 15" });
    expect(JSON.stringify(report)).not.toContain("matched");
  });

  it("keeps duplicate discoveries idempotent", async () => {
    createCandidate.mockResolvedValue({ status: "duplicate", imageId: "existing-image" });
    const discover = vi.fn().mockResolvedValue([
      matched(xiaomi),
    ]);

    const first = await runCatalogImageDiscovery({ mode: "single", productIds: [xiaomi.id] }, {
      loadProducts: async () => [xiaomi], providers: [provider("taobao", discover)], createCandidate,
    });
    const second = await runCatalogImageDiscovery({ mode: "single", productIds: [xiaomi.id] }, {
      loadProducts: async () => [xiaomi], providers: [provider("taobao", discover)], createCandidate,
    });

    expect(first.summary.duplicate).toBe(1);
    expect(second.summary.duplicate).toBe(1);
    expect(first.summary.created + second.summary.created).toBe(0);
  });

  it("caps candidate creation per Product and platform without touching an existing primary", async () => {
    const catalogProduct = { ...xiaomi, image: "https://img.alicdn.com/already-approved.jpg" };
    const originalImage = catalogProduct.image;
    const discover = vi.fn().mockResolvedValue(Array.from({ length: 8 }, (_, index) => (
      matched(catalogProduct, "taobao", `item-${index}`)
    )));

    const report = await runCatalogImageDiscovery({ mode: "single", productIds: [catalogProduct.id] }, {
      loadProducts: async () => [catalogProduct], providers: [provider("taobao", discover)], createCandidate,
    });

    expect(createCandidate).toHaveBeenCalledTimes(3);
    expect(report.summary.created).toBe(3);
    expect(catalogProduct.image).toBe(originalImage);
  });

  it("does not grow active Candidates after the Product/platform capacity is reached", async () => {
    const discover = vi.fn().mockResolvedValue([
      matched(xiaomi, "taobao", "rotating-item-1"),
      matched(xiaomi, "taobao", "rotating-item-2"),
      matched(xiaomi, "taobao", "rotating-item-3"),
    ]);
    const getActiveCandidateCount = vi.fn().mockResolvedValue(6);

    const report = await runCatalogImageDiscovery({ mode: "single", productIds: [xiaomi.id] }, {
      loadProducts: async () => [xiaomi],
      providers: [provider("taobao", discover)],
      createCandidate,
      getActiveCandidateCount,
    });

    expect(getActiveCandidateCount).toHaveBeenCalledWith(xiaomi.id, "taobao");
    expect(createCandidate).not.toHaveBeenCalled();
    expect(report.summary).toEqual({ created: 0, duplicate: 0, skipped: 3, rejected: 0, failed: 0 });
  });

  it("rejects a provider result that points at a different Catalog Product", async () => {
    const discover = vi.fn().mockResolvedValue([{
      source: { platform: "taobao", listing: {} },
      match: {
        status: "matched", product: iphone, matchConfidence: 1,
        evidence: { matcher: "taobao_phone_strict", signals: ["brand", "model"] },
      },
    }]);

    const report = await runCatalogImageDiscovery({ mode: "single", productIds: [xiaomi.id] }, {
      loadProducts: async () => [xiaomi, iphone], providers: [provider("taobao", discover)], createCandidate,
    });

    expect(createCandidate).not.toHaveBeenCalled();
    expect(report.summary.rejected).toBe(1);
  });

  it("does not run a phone provider for a category without a matcher", async () => {
    const clothing = { ...xiaomi, id: "clothing-1", name: "基础衬衫", category: "clothing" as typeof xiaomi.category };
    const discover = vi.fn();

    const report = await runCatalogImageDiscovery({ mode: "single", productIds: [clothing.id] }, {
      loadProducts: async () => [clothing], providers: [provider("taobao", discover)], createCandidate,
    });

    expect(discover).not.toHaveBeenCalled();
    expect(createCandidate).not.toHaveBeenCalled();
    expect(report.summary).toEqual({ created: 0, duplicate: 0, skipped: 1, rejected: 0, failed: 0 });
    expect(report.products[0]).toMatchObject({ status: "unsupported" });
  });

  it("isolates one platform failure and continues other products and platforms", async () => {
    const taobao = provider("taobao", vi.fn().mockRejectedValue(new Error("private platform response")));
    const pdd = provider("pdd", vi.fn(async (product: typeof xiaomi) => [matched(product, "pdd")]));

    const report = await runCatalogImageDiscovery({ mode: "batch", productIds: [xiaomi.id, iphone.id] }, {
      loadProducts: async () => [xiaomi, iphone], providers: [taobao, pdd], createCandidate,
    });

    expect(report.summary).toEqual({ created: 2, duplicate: 0, skipped: 0, rejected: 0, failed: 2 });
    expect(createCandidate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(report)).not.toContain("private platform response");
  });

  it("aborts only the timed-out platform request and continues the other provider", async () => {
    let timedOutSignal: AbortSignal | undefined;
    const taobao = provider("taobao", vi.fn((_product: typeof xiaomi, signal: AbortSignal): Promise<never> => new Promise((_, reject) => {
      timedOutSignal = signal;
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })));
    const pdd = provider("pdd", vi.fn(async (product: typeof xiaomi) => [matched(product, "pdd")]));

    const report = await runCatalogImageDiscovery({ mode: "single", productIds: [xiaomi.id] }, {
      loadProducts: async () => [xiaomi], providers: [taobao, pdd], createCandidate, timeoutMs: 5,
    });

    expect(timedOutSignal?.aborted).toBe(true);
    expect(report.summary).toEqual({ created: 1, duplicate: 0, skipped: 0, rejected: 0, failed: 1 });
  });

  it("rejects oversized batches before loading Catalog or calling platforms", async () => {
    const loadProducts = vi.fn();
    const discover = vi.fn();
    const productIds = Array.from({ length: MAX_CATALOG_IMAGE_DISCOVERY_PRODUCTS + 1 }, (_, index) => `product-${index}`);

    await expect(runCatalogImageDiscovery({ mode: "batch", productIds }, {
      loadProducts, providers: [provider("taobao", discover)], createCandidate,
    })).rejects.toEqual(new CatalogImageDiscoveryError("batch_limit"));

    expect(loadProducts).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
  });

  it("never runs more than two external discovery jobs concurrently", async () => {
    let active = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const discover = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gate;
      active -= 1;
      return [];
    });
    const operation = runCatalogImageDiscovery({ mode: "batch", productIds: [xiaomi.id, iphone.id] }, {
      loadProducts: async () => [xiaomi, iphone],
      providers: [provider("taobao", discover), provider("pdd", discover)],
      createCandidate,
    });
    await vi.waitFor(() => expect(discover).toHaveBeenCalledTimes(2));
    expect(peak).toBe(2);
    release();
    await operation;
    expect(discover).toHaveBeenCalledTimes(4);
    expect(peak).toBe(2);
  });
});
