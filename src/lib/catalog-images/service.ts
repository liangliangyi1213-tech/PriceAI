import "server-only";

import { resolveCatalogImage } from "./resolver";
import { SupabaseCatalogImageRepository } from "./repository";
import type { CatalogImage, CatalogImageResolution } from "./types";

type ApprovedImageReader = {
  getApprovedPrimaries(productId: string): Promise<CatalogImage[]>;
};

export async function resolveCatalogImageForProduct(
  input: {
    productId: string;
    variantId?: string | null;
    legacyImage: string | null | undefined;
  },
  repository: ApprovedImageReader = new SupabaseCatalogImageRepository(),
): Promise<CatalogImageResolution> {
  const images = await repository.getApprovedPrimaries(input.productId);
  return resolveCatalogImage({ ...input, images });
}
