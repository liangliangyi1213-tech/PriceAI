import "server-only";

import { resolveCatalogImage } from "./resolver";
import { SupabaseCatalogImageRepository } from "./repository";
import type { CatalogImage, CatalogImageResolution } from "./types";

type ApprovedImageReader = {
  getApprovedPrimaries(productId: string): Promise<CatalogImage[]>;
};

type ApprovedImagesBatchReader = {
  getApprovedPrimariesForProducts(productIds: readonly string[]): Promise<CatalogImage[]>;
};

export type CatalogImageResolutionInput = Readonly<{
  productId: string;
  variantId: string | null;
  legacyImage: string | null | undefined;
}>;

export type CatalogImageResolutionResult = Readonly<{
  productId: string;
  variantId: string | null;
  resolution: CatalogImageResolution;
}>;

export async function resolveCatalogImageForProduct(
  input: {
    productId: string;
    variantId: string | null;
    legacyImage: string | null | undefined;
  },
  repository: ApprovedImageReader = new SupabaseCatalogImageRepository(),
): Promise<CatalogImageResolution> {
  const images = await repository.getApprovedPrimaries(input.productId);
  return resolveCatalogImage({ ...input, images });
}

export async function resolveCatalogImagesForProducts(
  inputs: readonly CatalogImageResolutionInput[],
  repository: ApprovedImagesBatchReader = new SupabaseCatalogImageRepository(),
): Promise<CatalogImageResolutionResult[]> {
  if (inputs.length === 0) return [];
  const productIds = [...new Set(inputs.map((input) => input.productId))];
  const images = await repository.getApprovedPrimariesForProducts(productIds);
  return inputs.map((input) => ({
    productId: input.productId,
    variantId: input.variantId,
    resolution: resolveCatalogImage({ ...input, images }),
  }));
}
