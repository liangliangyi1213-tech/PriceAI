export { matchPhoneProduct } from "./matching";
export { compactText, normalizePlatformSearchResult, normalizeText } from "./normalize";
export { buildCatalogSyncPlan, createOfferIdentity } from "./plan";
export { createCatalogSyncService } from "./service";
export { SupabaseCatalogSyncWriter } from "./repository";
export { CatalogSyncConfigurationError, getCatalogSyncWriteClient } from "./write-client";
export type * from "./types";
