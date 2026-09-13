import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { executeCatalogImageAdminOperation, CatalogImageAdminOperationError } from "./admin-service";
import type { CatalogImage } from "./types";

function image(overrides: Partial<CatalogImage> = {}): CatalogImage {
  return {
    id: "image-1", productId: "product-1", variantId: null, targetType: "product",
    role: "gallery", status: "candidate", platform: "taobao", externalProductId: "external-1",
    externalVariantId: null, sourceKind: "pict_url", sourceUrl: "https://img.alicdn.com/item.jpg",
    sourceHost: "img.alicdn.com", sourceUrlHash: "a".repeat(64), matchConfidence: 1,
    matchEvidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model"] },
    contentHash: null, storageBucket: null, storageObjectPath: null, verifiedAt: null,
    verifiedBy: null, verificationMethod: null, firstSeenAt: "2026-09-12T00:00:00.000Z",
    lastSeenAt: "2026-09-12T01:00:00.000Z", ...overrides,
  };
}

describe("Catalog image admin operations", () => {
  const approve = vi.fn();
  const promote = vi.fn();
  const reject = vi.fn();
  const getApprovedPrimaries = vi.fn();
  const repository = {
    getApprovedPrimaries,
    getReviewContext: vi.fn(),
    approveCandidate: vi.fn(),
    rejectCandidate: vi.fn(),
    promotePrimary: vi.fn(),
  };
  const deps = { approve, promote, reject, repository };

  beforeEach(() => {
    vi.clearAllMocks();
    approve.mockResolvedValue(image({ status: "approved", verifiedAt: "2026-09-12T02:00:00.000Z" }));
    promote.mockResolvedValue({ imageId: "image-1", previousImageId: null, action: "initial", eventId: "event-1" });
    reject.mockResolvedValue(undefined);
    getApprovedPrimaries.mockResolvedValue([]);
  });

  it("rejects every mutation when the admin session or same-origin proof is missing", async () => {
    await expect(executeCatalogImageAdminOperation({
      authorized: false, sameOrigin: true, reviewer: "admin", operation: { type: "approve", imageId: "image-1" },
    }, deps)).rejects.toEqual(new CatalogImageAdminOperationError("unauthorized"));
    await expect(executeCatalogImageAdminOperation({
      authorized: true, sameOrigin: false, reviewer: "admin", operation: { type: "approve", imageId: "image-1" },
    }, deps)).rejects.toEqual(new CatalogImageAdminOperationError("unauthorized"));
    expect(approve).not.toHaveBeenCalled();
  });

  it("approves a candidate through the formal review service", async () => {
    await expect(executeCatalogImageAdminOperation({
      authorized: true, sameOrigin: true, reviewer: "admin", operation: { type: "approve", imageId: "image-1" },
    }, deps)).resolves.toEqual({ status: "approved" });
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ imageId: "image-1", reviewer: "admin" }), expect.anything());
  });

  it("approves then creates an initial primary through the formal promotion service", async () => {
    await expect(executeCatalogImageAdminOperation({
      authorized: true, sameOrigin: true, reviewer: "admin",
      operation: { type: "approve_primary", imageId: "image-1", reason: "verified catalog identity" },
    }, deps)).resolves.toEqual({ status: "primary", action: "initial" });
    expect(promote).toHaveBeenCalledWith(expect.objectContaining({ action: "initial", imageId: "image-1" }), expect.anything());
  });

  it("uses replacement when the same Catalog target already has a primary", async () => {
    getApprovedPrimaries.mockResolvedValue([image({ id: "old-primary", status: "approved", role: "primary" })]);
    promote.mockResolvedValue({ imageId: "image-1", previousImageId: "old-primary", action: "replace", eventId: "event-2" });
    await expect(executeCatalogImageAdminOperation({
      authorized: true, sameOrigin: true, reviewer: "admin",
      operation: { type: "approve_primary", imageId: "image-1", reason: "replace with verified image" },
    }, deps)).resolves.toEqual({ status: "primary", action: "replace" });
  });

  it("requires a reason and rejects only through the formal review service", async () => {
    await expect(executeCatalogImageAdminOperation({
      authorized: true, sameOrigin: true, reviewer: "admin",
      operation: { type: "reject", imageId: "image-1", reason: "" },
    }, deps)).rejects.toEqual(new CatalogImageAdminOperationError("invalid_input"));
    await executeCatalogImageAdminOperation({
      authorized: true, sameOrigin: true, reviewer: "admin",
      operation: { type: "reject", imageId: "image-1", reason: "wrong product identity" },
    }, deps);
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ imageId: "image-1", reason: "wrong product identity" }), expect.anything());
  });

  it("does not promote when formal review rejects a target mismatch", async () => {
    approve.mockResolvedValue({ status: "rejected", reason: "target_invalid" });
    await expect(executeCatalogImageAdminOperation({
      authorized: true, sameOrigin: true, reviewer: "admin",
      operation: { type: "approve_primary", imageId: "image-1", reason: "attempt" },
    }, deps)).resolves.toEqual({ status: "rejected", reason: "target_invalid" });
    expect(promote).not.toHaveBeenCalled();
  });
});
