import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getCatalogSyncWriteClient } from "@/lib/catalog-sync/write-client";

import { createCatalogImageCandidate } from "./candidate-service";
import { createCatalogImageSourceRegistry } from "./catalog-image-source";
import { enqueueCatalogImageMirrorJob, runNextCatalogImageMirrorJob } from "./mirror-job-service";
import { SupabaseCatalogImageMirrorJobRepository } from "./mirror-job-repository";
import { createMirrorPolicyRegistry, type MirrorPolicy } from "./mirror-policy";
import { SupabaseCatalogImageRepository } from "./repository";
import { approveCatalogImageCandidate, promoteCatalogImagePrimary } from "./review-service";
import { resolveCatalogImageForProduct } from "./service";
import { createCatalogImageMirrorService } from "./mirror-service";
import { createSupabaseMirrorStorage } from "./mirror-storage";
import { isLocalPilotEnabled, ownedPilotPng } from "./testing/local-pilot-fixture";
import { resolveCatalogImageStorageUrl } from "./storage-resolver";

const pilotEnabled = isLocalPilotEnabled(process.env);

const describeLocalPilot = pilotEnabled ? describe : describe.skip;
const fixtureUrl = "https://fixture.assets.priceai.test/owned-pilot-image.png";
const fixtureSources = createCatalogImageSourceRegistry([
  {
    platform: "priceai_fixture",
    allowedHosts: ["fixture.assets.priceai.test"],
    allowedSourceKinds: ["owned_fixture"],
    allowedMatchers: ["priceai_fixture_deterministic"],
  },
]);
const fixturePolicy: MirrorPolicy = {
  platform: "priceai_fixture",
  category: "phone",
  mode: "mirror_allowed",
  allowedMimeTypes: ["image/png"],
  maxDownloadBytes: 256 * 1024,
  maxDecodedPixels: 1_000_000,
  transform: "preserve",
  policyVersion: 1,
  authorizationBasis: "priceai_owned_local_test_fixture",
};
const fixtureRegistry = createMirrorPolicyRegistry([fixturePolicy]);

const fixtureBytes = ownedPilotPng();

describeLocalPilot("local Catalog image mirror pilot", () => {
  it("runs the approved-primary mirror pipeline against isolated local Supabase and Storage", async () => {
    console.info("PILOT_STAGE:identity");
    // Independently verify that this port belongs to the newly created pilot stack.
    // The wrapper owns and destroys that entire stack in finally, even on failure.
    const project = process.env.PRICEAI_LOCAL_MIRROR_PILOT_PROJECT!;
    const bindings = JSON.parse(execFileSync("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", `supabase_kong_${project}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    expect(bindings["8000/tcp"]).toEqual(expect.arrayContaining([expect.objectContaining({ HostPort: "55421" })]));
    const client = getCatalogSyncWriteClient();
    const suffix = randomUUID().replaceAll("-", "");
    const productId = `pilot-${suffix}`;
    const sourceId = `owned-pilot-${suffix}`;
    const catalog = new SupabaseCatalogImageRepository();
    const jobs = new SupabaseCatalogImageMirrorJobRepository();
    const storage = createSupabaseMirrorStorage();

    const { error: productError } = await client.from("products").insert({
      id: productId,
      slug: productId,
      brand: "PriceAI",
      name: "Local Mirror Pilot",
      category: "phone",
      description: "Isolated local image mirror verification fixture.",
      image: "/phone-placeholder.svg",
      specs: {},
    });
    expect(productError).toBeNull();
    console.info("PILOT_STAGE:product");

    const candidate = await createCatalogImageCandidate({
      source: {
        platform: "priceai_fixture",
        externalProductId: sourceId,
        externalVariantId: null,
        sourceKind: "owned_fixture",
        sourceUrl: fixtureUrl,
      },
      match: {
        status: "matched",
        product: {
          id: productId,
          slug: productId,
          brand: "PriceAI",
          name: "Local Mirror Pilot",
          category: "phone",
          description: "Isolated local image mirror verification fixture.",
          image: "/phone-placeholder.svg",
          specs: {},
          variants: [],
        },
        matchConfidence: 1,
        evidence: { matcher: "priceai_fixture_deterministic", signals: ["category"] },
      },
    }, catalog, { sourceRegistry: fixtureSources });
    expect(candidate.status).toBe("created");
    if (candidate.status !== "created") throw new Error("Pilot Candidate was not created.");
    console.info("PILOT_STAGE:candidate");

    const approved = await approveCatalogImageCandidate({
      imageId: candidate.imageId,
      reviewer: "local-pilot",
      reviewMethod: "manual_cross_check",
    }, catalog, { sourceRegistry: fixtureSources });
    expect(approved.status).toBe("approved");
    console.info("PILOT_STAGE:review");

    const promotion = await promoteCatalogImagePrimary({
      imageId: candidate.imageId,
      action: "initial",
      reviewer: "local-pilot",
      reason: "Isolated local mirror pilot",
    }, catalog);
    const enqueue = await enqueueCatalogImageMirrorJob(promotion, {
      jobs,
      catalog,
      registry: fixtureRegistry,
      sourceRegistry: fixtureSources,
    });
    expect(enqueue.status).toBe("enqueued");
    console.info("PILOT_STAGE:enqueue");
    await expect(enqueueCatalogImageMirrorJob(promotion, {
      jobs,
      catalog,
      registry: fixtureRegistry,
      sourceRegistry: fixtureSources,
    })).resolves.toMatchObject({ status: "existing" });

    const mirror = createCatalogImageMirrorService({
      repository: catalog,
      storage,
      registry: fixtureRegistry,
      sourceRegistry: fixtureSources,
      download: async () => ({ bytes: fixtureBytes, headerContentType: "image/png" }),
      now: () => new Date(),
    });
    await expect(runNextCatalogImageMirrorJob({
      jobs,
      catalog,
      registry: fixtureRegistry,
      sourceRegistry: fixtureSources,
      mirror: (imageId) => mirror.mirror(imageId),
      now: () => new Date(),
      random: () => 0.5,
      maxAttempts: 3,
      processingTimeoutMs: 60_000,
    })).resolves.toMatchObject({ status: "succeeded" });
    console.info("PILOT_STAGE:mirror");

    const context = await catalog.getMirrorContext(candidate.imageId);
    expect(context?.image.status).toBe("approved");
    expect(context?.image.role).toBe("primary");
    expect(context?.image.storageBucket).toBe("catalog-images");
    expect(context?.image.storageObjectPath).toMatch(new RegExp(`^products/${productId}/`));
    expect(context?.image.contentType).toBe("image/png");
    expect(context?.image.width).toBe(10);
    expect(context?.image.height).toBe(20);
    expect(context?.image.mirroredAt).toBeTruthy();
    expect(context?.image.lastCheckedAt).toBeTruthy();
    expect(await storage.exists(context?.image.storageObjectPath ?? "")).toBe(true);

    await expect(mirror.mirror(candidate.imageId)).resolves.toMatchObject({
      status: "mirrored",
      storageStatus: "reused",
      storageObjectPath: context?.image.storageObjectPath,
    });

    const resolution = await resolveCatalogImageForProduct({
      productId,
      variantId: null,
      legacyImage: "/phone-placeholder.svg",
    }, catalog, (image) => resolveCatalogImageStorageUrl(image, {
      // URL construction only; the local HTTP Storage API is not a public TLS test.
      getPublicUrl: (path) => ({ data: { publicUrl: `https://local-storage.priceai.test/storage/v1/object/public/catalog-images/${path}` } }),
    }), fixtureSources);
    expect(resolution).toMatchObject({
      source: "approved_product_storage",
      imageId: candidate.imageId,
      platform: "priceai_fixture",
    });
    console.info("PILOT_STAGE:resolver");

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const localUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!anonKey || !localUrl) throw new Error("Local pilot authentication is not configured.");
    const anonymous = createClient(localUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: anonymousWriteError } = await anonymous.from("product_images").insert({});
    expect(anonymousWriteError?.code).toBe("42501");
  }, 60_000);
});
