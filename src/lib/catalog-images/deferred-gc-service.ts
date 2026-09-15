import "server-only";

import {
  analyzeDeferredCatalogImageGc,
  type CatalogImageGcCandidate,
  type CatalogImageGcSnapshot,
} from "./deferred-gc";
import { SupabaseCatalogImageDeferredGcRepository } from "./deferred-gc-repository";

type DeferredGcRepository = Readonly<{ load(): Promise<CatalogImageGcSnapshot> }>;

export async function analyzeCatalogImageGcCandidates(
  repository: DeferredGcRepository = new SupabaseCatalogImageDeferredGcRepository(),
  now: () => Date = () => new Date(),
): Promise<CatalogImageGcCandidate[]> {
  return analyzeDeferredCatalogImageGc({ ...(await repository.load()), now: now() });
}
