import { notFound } from "next/navigation";
import { CompareToggleButton } from "@/components/compare/compare-selection";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PriceHistoryPanel } from "@/components/price-history/price-history-panel";
import { PlatformOffers } from "@/components/product/platform-offers";
import { ProductDecisionHero } from "@/components/product/product-decision-hero";
import { ProductInsightPanel } from "@/components/product/product-insight-panel";
import { ProductSpecifications } from "@/components/product/product-specifications";
import { getProductInsight } from "@/lib/ai/product-insight";
import { getProductBySlug } from "@/lib/catalog/repository";
import { getVariantPriceHistoryViewModel } from "@/lib/price-history/service";
import { scoreVariant } from "@/lib/scoring/value-score";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();
  const variant = product.variants[0];
  if (!variant) notFound();
  const score = scoreVariant(variant);
  const [insight, priceHistory] = await Promise.all([getProductInsight(product, variant), getVariantPriceHistoryViewModel(variant.id)]);

  return <><SiteHeader/><main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
    <ProductDecisionHero compareAction={<CompareToggleButton productOptions={[{ slug: product.slug, name: product.name }]} productSlug={product.slug}/>} product={product} score={score.total} variant={variant}/>
    <PlatformOffers offers={variant.offers}/>
    <PriceHistoryPanel view={priceHistory}/>
    <ProductInsightPanel insight={insight}/>
    <ProductSpecifications specs={product.specs}/>
  </main><SiteFooter/></>;
}
