export { matchPhoneProduct } from "./matching";
export { compactText, normalizePlatformSearchResult, normalizeText } from "./normalize";
export { buildCatalogSyncPlan, createOfferIdentity } from "./plan";
export { createCatalogSyncService } from "./service";
export { createCatalogSyncRunner } from "./runner";
export { SupabaseCatalogSyncRunRepository } from "./run-repository";
export { SupabaseCatalogSyncWriter } from "./repository";
export { CatalogSyncConfigurationError, getCatalogSyncWriteClient } from "./write-client";
export type * from "./types";
