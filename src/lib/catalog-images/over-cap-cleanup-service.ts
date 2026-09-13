import "server-only";

import { SupabaseCatalogImageRepository } from "./repository";
import { CatalogImageReviewError, rejectCatalogImageCandidate, type CatalogImageReviewRepository } from "./review-service";
import { selectSuggestedCleanupCatalogImages } from "./over-cap-governance";

export const OVER_CAP_REJECTION_REASON = "superseded_by_capacity_policy: 同质量候选超过平台容量上限，保留排序更高的候选";

export class CatalogImageOverCapCleanupError extends Error {
  constructor(readonly code: "unauthorized" | "invalid_input" | "cleanup_failed") {
    super("Catalog image over-cap cleanup could not be completed.");
    this.name = "CatalogImageOverCapCleanupError";
  }
}

type CleanupRepository = CatalogImageReviewRepository & Pick<SupabaseCatalogImageRepository, "getActiveCandidates">;
type Dependencies = Readonly<{
  repository: CleanupRepository;
  reject: typeof rejectCatalogImageCandidate;
}>;

const defaultRepository = new SupabaseCatalogImageRepository();
const defaultDependencies: Dependencies = {
  repository: defaultRepository,
  reject: rejectCatalogImageCandidate,
};

function validIdentity(value: string, maxLength: number): boolean {
  const length = value.trim().length;
  return length > 0 && length <= maxLength;
}

export async function cleanupCatalogImageCandidateOverCap(
  input: Readonly<{
    authorized: boolean;
    sameOrigin: boolean;
    confirmed: boolean;
    reviewer: string;
    productId: string;
    platform: string;
  }>,
  dependencies: Dependencies = defaultDependencies,
): Promise<Readonly<{
  activeBefore: number;
  activeAfter: number;
  processed: number;
  concurrentSkipped: number;
}>> {
  if (!input.authorized || !input.sameOrigin) throw new CatalogImageOverCapCleanupError("unauthorized");
  if (!input.confirmed || !validIdentity(input.reviewer, 120)
    || !validIdentity(input.productId, 120) || !validIdentity(input.platform, 40)) {
    throw new CatalogImageOverCapCleanupError("invalid_input");
  }

  const productId = input.productId.trim();
  const platform = input.platform.trim();
  try {
    const initial = await dependencies.repository.getActiveCandidates(productId, platform);
    const activeBefore = initial.length;
    let processed = 0;
    let concurrentSkipped = 0;
    const maxAttempts = Math.max(1, activeBefore + 10);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const current = await dependencies.repository.getActiveCandidates(productId, platform);
      const suggested = selectSuggestedCleanupCatalogImages(current, { productId, platform });
      if (suggested.length === 0) {
        return { activeBefore, activeAfter: current.length, processed, concurrentSkipped };
      }
      // Lowest-ranked suggestion first; the next iteration always recalculates the remaining scope.
      const target = suggested[suggested.length - 1];
      try {
        await dependencies.reject({
          imageId: target.id,
          reviewer: input.reviewer.trim(),
          reason: OVER_CAP_REJECTION_REASON,
        }, dependencies.repository);
        processed += 1;
      } catch (error) {
        if (error instanceof CatalogImageReviewError
          && (error.code === "not_candidate" || error.code === "not_found")) {
          concurrentSkipped += 1;
          continue;
        }
        throw error;
      }
    }
    throw new CatalogImageOverCapCleanupError("cleanup_failed");
  } catch (error) {
    if (error instanceof CatalogImageOverCapCleanupError) throw error;
    throw new CatalogImageOverCapCleanupError("cleanup_failed");
  }
}
