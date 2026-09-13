import "server-only";

import { SupabaseCatalogImageRepository } from "./repository";
import {
  approveCatalogImageCandidate,
  promoteCatalogImagePrimary,
  rejectCatalogImageCandidate,
  type CatalogImageReviewRepository,
  type CatalogImageReviewFailure,
  type PrimaryPromotionResult,
} from "./review-service";
import type { CatalogImage } from "./types";

export type CatalogImageAdminOperation =
  | Readonly<{ type: "approve"; imageId: string }>
  | Readonly<{ type: "approve_primary"; imageId: string; reason: string }>
  | Readonly<{ type: "reject"; imageId: string; reason: string }>;

export class CatalogImageAdminOperationError extends Error {
  constructor(readonly code: "unauthorized" | "invalid_input" | "operation_failed") {
    super("Catalog image admin operation could not be completed.");
    this.name = "CatalogImageAdminOperationError";
  }
}

type AdminReviewRepository = CatalogImageReviewRepository & {
  getApprovedPrimaries(productId: string): Promise<CatalogImage[]>;
};

type AdminOperationDependencies = Readonly<{
  repository: AdminReviewRepository;
  approve: typeof approveCatalogImageCandidate;
  promote: typeof promoteCatalogImagePrimary;
  reject: typeof rejectCatalogImageCandidate;
}>;

const defaultRepository = new SupabaseCatalogImageRepository();
const defaultDependencies: AdminOperationDependencies = {
  repository: defaultRepository,
  approve: approveCatalogImageCandidate,
  promote: promoteCatalogImagePrimary,
  reject: rejectCatalogImageCandidate,
};

function validIdentity(value: string): boolean {
  const length = value.trim().length;
  return length > 0 && length <= 100;
}

function sameTarget(left: CatalogImage, right: CatalogImage): boolean {
  return left.productId === right.productId
    && left.targetType === right.targetType
    && left.variantId === right.variantId;
}

export async function executeCatalogImageAdminOperation(
  input: Readonly<{
    authorized: boolean;
    sameOrigin: boolean;
    reviewer: string;
    operation: CatalogImageAdminOperation;
  }>,
  dependencies: AdminOperationDependencies = defaultDependencies,
): Promise<
  | Readonly<{ status: "approved" | "rejected"; reason?: CatalogImageReviewFailure }>
  | Readonly<{ status: "primary"; action: PrimaryPromotionResult["action"] }>
> {
  if (!input.authorized || !input.sameOrigin) throw new CatalogImageAdminOperationError("unauthorized");
  if (!validIdentity(input.reviewer) || !validIdentity(input.operation.imageId)) {
    throw new CatalogImageAdminOperationError("invalid_input");
  }
  try {
    if (input.operation.type === "reject") {
      const reason = input.operation.reason.trim();
      if (!reason || reason.length > 500) throw new CatalogImageAdminOperationError("invalid_input");
      await dependencies.reject({ imageId: input.operation.imageId, reviewer: input.reviewer, reason }, dependencies.repository);
      return { status: "rejected" };
    }

    const approved = await dependencies.approve({
      imageId: input.operation.imageId,
      reviewer: input.reviewer,
      reviewMethod: "manual_cross_check",
    }, dependencies.repository);
    if (!("id" in approved)) return approved;
    if (input.operation.type === "approve") return { status: "approved" };

    const reason = input.operation.reason.trim();
    if (!reason || reason.length > 500) throw new CatalogImageAdminOperationError("invalid_input");
    const primaries = await dependencies.repository.getApprovedPrimaries(approved.productId);
    const action = primaries.some((primary) => primary.role === "primary" && sameTarget(primary, approved))
      ? "replace"
      : "initial";
    await dependencies.promote({
      imageId: approved.id,
      action,
      reviewer: input.reviewer,
      reason,
    }, dependencies.repository);
    return { status: "primary", action };
  } catch (error) {
    if (error instanceof CatalogImageAdminOperationError) throw error;
    throw new CatalogImageAdminOperationError("operation_failed");
  }
}
