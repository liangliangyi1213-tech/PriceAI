import "server-only";

import { enqueueCatalogImageMirrorJob } from "./mirror-job-service";
import type { CatalogImageMirrorEnqueueResult } from "./mirror-job-types";
import { SupabaseCatalogImageRepository } from "./repository";
import {
  promoteCatalogImagePrimary,
  type CatalogImageReviewRepository,
  type PrimaryPromotionAction,
  type PrimaryPromotionResult,
} from "./review-service";

export type PrimaryPromotionSchedulingResult = PrimaryPromotionResult & Readonly<{
  mirrorJob: CatalogImageMirrorEnqueueResult | Readonly<{ status: "enqueue_failed" }>;
}>;

export async function promoteCatalogImagePrimaryAndSchedule(
  input: Readonly<{
    imageId: string;
    action: PrimaryPromotionAction;
    reviewer: string;
    reason: string;
  }>,
  repository: CatalogImageReviewRepository = new SupabaseCatalogImageRepository(),
  enqueue: typeof enqueueCatalogImageMirrorJob = enqueueCatalogImageMirrorJob,
): Promise<PrimaryPromotionSchedulingResult> {
  const promotion = await promoteCatalogImagePrimary(input, repository);
  try {
    const mirrorJob = await enqueue(promotion);
    return { ...promotion, mirrorJob };
  } catch {
    // Promotion is already committed. Scheduling failure is observable but must not roll it back.
    return { ...promotion, mirrorJob: { status: "enqueue_failed" } };
  }
}
