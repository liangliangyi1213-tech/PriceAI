import "server-only";

import {
  runCatalogImageDiscovery,
  type CatalogImageDiscoveryInput,
  type CatalogImageDiscoveryReport,
} from "./discovery-service";

export type CatalogImageDiscoveryAdminErrorCode = "unauthorized" | "invalid_origin" | "discovery_failed";

export class CatalogImageDiscoveryAdminError extends Error {
  constructor(readonly code: CatalogImageDiscoveryAdminErrorCode) {
    super("Catalog image discovery is unavailable.");
    this.name = "CatalogImageDiscoveryAdminError";
  }
}

type Dependencies = Readonly<{
  runDiscovery?: typeof runCatalogImageDiscovery;
}>;

export async function executeCatalogImageDiscoveryAdminOperation(
  request: Readonly<{
    authorized: boolean;
    sameOrigin: boolean;
    input: CatalogImageDiscoveryInput;
  }>,
  dependencies: Dependencies = {},
): Promise<CatalogImageDiscoveryReport> {
  if (!request.authorized) throw new CatalogImageDiscoveryAdminError("unauthorized");
  if (!request.sameOrigin) throw new CatalogImageDiscoveryAdminError("invalid_origin");
  try {
    return await (dependencies.runDiscovery ?? runCatalogImageDiscovery)(request.input);
  } catch {
    throw new CatalogImageDiscoveryAdminError("discovery_failed");
  }
}
