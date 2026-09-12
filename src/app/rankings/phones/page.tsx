import Link from "next/link";

import { CatalogProductImage } from "@/components/catalog/catalog-product-image";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { resolveCatalogImagesForProducts } from "@/lib/catalog-images/service";
import type { CatalogImageResolution } from "@/lib/catalog-images/types";
import { getProducts } from "@/lib/catalog/repository";
import { formatPrice, getLowestOffer } from "@/lib/pricing/offers";
import { sortProducts } from "@/lib/ranking/products";
import { scoreVariant } from "@/lib/scoring/value-score";

const noImage: CatalogImageResolution = { kind: "none", source: "none", url: null, imageId: null, platform: null };

export default async function Page() {
  const products = await getProducts();
  const rows = sortProducts(products.map((product) => ({ product, score: scoreVariant(product.variants[0]).total })), "recommended");
  const imageResults = await resolveCatalogImagesForProducts(products.map((product) => ({
    productId: product.id,
    variantId: null,
    legacyImage: product.image,
  })));
  const imagesByProductId = new Map(imageResults.map((result) => [result.productId, result.resolution]));

  return <><SiteHeader/><main className="mx-auto max-w-4xl px-4 py-12"><h1 className="text-3xl font-bold">手机性价比榜单</h1>{rows.map((row, index) => { const offer = getLowestOffer(row.product.variants[0].offers)!; return <Link className="mt-3 grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3" href={`/products/${row.product.slug}`} key={row.product.id}><div className="overflow-hidden rounded-lg border border-slate-100"><CatalogProductImage className="aspect-square" imageClassName="object-contain p-1.5" productName={row.product.name} resolution={imagesByProductId.get(row.product.id) ?? noImage}/></div><b className="min-w-0">#{index + 1} {row.product.name}</b><span className="text-right">{formatPrice(offer.price)} · {row.score}</span></Link>; })}</main><SiteFooter/></>;
}
export const dynamic = "force-dynamic";
