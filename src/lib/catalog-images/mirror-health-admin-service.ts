import "server-only";

import { checkCatalogImageMirrorHealth } from "./mirror-health";

export class CatalogImageMirrorHealthAdminError extends Error {
  constructor() {
    super("Catalog image mirror health operation is unavailable.");
    this.name = "CatalogImageMirrorHealthAdminError";
  }
}

type HealthCheck = typeof checkCatalogImageMirrorHealth;

export async function executeCatalogImageMirrorHealthAdminOperation(
  input: Readonly<{
    authorized: boolean;
    sameOrigin: boolean;
    imageId: string;
    mode: "shallow" | "deep";
  }>,
  service: Readonly<{ check: HealthCheck }> = { check: checkCatalogImageMirrorHealth },
) {
  const imageId = input.imageId.trim();
  if (!input.authorized || !input.sameOrigin || !imageId
    || (input.mode !== "shallow" && input.mode !== "deep")) {
    throw new CatalogImageMirrorHealthAdminError();
  }
  try {
    return await service.check(imageId, { mode: input.mode, updateLastCheckedAt: true });
  } catch {
    throw new CatalogImageMirrorHealthAdminError();
  }
}
