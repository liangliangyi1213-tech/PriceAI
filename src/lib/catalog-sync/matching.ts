import type { Product } from "@/types/catalog";

import { compactText } from "./normalize";
import type { NormalizedPlatformProduct } from "./types";

export type MatchOutcome =
  | { status: "matched"; product: Product; variant: Product["variants"][number] }
  | { status: "unmatched" }
  | { status: "ambiguous" };

export function matchPhoneProduct(input: NormalizedPlatformProduct, products: Product[]): MatchOutcome {
  if (!input.brand || !input.storage) return { status: "unmatched" };
  const inputBrand = input.brand;
  const haystack = compactText(`${input.title} ${input.externalProductId}`);
  const candidates = products.filter((product) => {
    const productBrand = compactText(product.brand);
    const brandMatches = productBrand === compactText(inputBrand) || (inputBrand === "Apple" && productBrand === "apple");
    return brandMatches && haystack.includes(compactText(product.name));
  });
  if (!candidates.length) return { status: "unmatched" };
  const longest = Math.max(...candidates.map((candidate) => compactText(candidate.name).length));
  const bestProducts = candidates.filter((candidate) => compactText(candidate.name).length === longest);
  if (bestProducts.length !== 1) return { status: "ambiguous" };
  const variants = bestProducts[0].variants.filter((variant) => variant.storage === input.storage && (!input.color || variant.color === input.color));
  if (!variants.length) return { status: "unmatched" };
  if (variants.length !== 1) return { status: "ambiguous" };
  return { status: "matched", product: bestProducts[0], variant: variants[0] };
}
