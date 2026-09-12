import { Capabilities } from "@/components/home/capabilities";
import { FeaturedProducts } from "@/components/home/featured-products";
import { HeroDiscovery } from "@/components/home/hero-discovery";
import { HomeCategoryNav } from "@/components/home/home-category-nav";
import { ShoppingDiscovery } from "@/components/home/shopping-discovery";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SearchForm } from "@/components/search/search-form";
import { getProducts } from "@/lib/catalog/repository";
import { resolveCatalogImagesForProducts } from "@/lib/catalog-images/service";
import { buildHomeDailyHighlights, buildHomeDiscoveryItems, buildHomeRecommendationFeed } from "@/lib/home/home-feed";
import { searchCatalog } from "@/lib/search/products";
export const dynamic = "force-dynamic";

export default async function Home() {
  const products = await getProducts();
  const imageResults = await resolveCatalogImagesForProducts(products.map((product) => ({
    productId: product.id,
    variantId: null,
    legacyImage: product.image,
  })));
  const imagesByProductId = new Map(imageResults.map((result) => [result.productId, result.resolution]));
  const rankedCatalog = searchCatalog(products, { sort: "score_desc" });
  const dailyHighlights = buildHomeDailyHighlights(rankedCatalog);
  const recommendationFeed = buildHomeRecommendationFeed(rankedCatalog, {
    excludedProductIds: dailyHighlights.map((item) => item.row.product.id),
  });
  const discoveryItems = buildHomeDiscoveryItems(searchCatalog(products, { sort: "price_asc" }));

  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative isolate overflow-hidden border-b border-slate-200 bg-[linear-gradient(145deg,#eff6ff_0%,#fff_47%,#f8fafc_100%)] py-10 sm:py-12 lg:py-14">
          <div aria-hidden="true" className="absolute left-[18%] top-0 -z-10 h-64 w-96 rounded-full bg-blue-200/35 blur-3xl" />
          <div className="page-shell grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:gap-12">
            <div className="min-w-0">
              <h1 className="max-w-3xl text-4xl font-bold tracking-[-0.055em] text-slate-950 sm:text-5xl lg:text-6xl">买之前，先问 <span className="text-blue-600">PriceAI</span></h1>
              <p className="mt-4 text-base font-semibold text-slate-700 sm:text-lg">比价格 · 看历史 · 算性价比 · AI 帮你选</p>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">用价格、历史、口碑与 AI 分析，帮你作出更有依据的购买决定。</p>
              <SearchForm align="start" />
              <HomeCategoryNav />
            </div>
            <HeroDiscovery highlights={dailyHighlights} imagesByProductId={imagesByProductId} />
          </div>
        </section>
        <FeaturedProducts feed={recommendationFeed} imagesByProductId={imagesByProductId} />
        <ShoppingDiscovery items={discoveryItems} />
        <Capabilities />
      </main>
      <SiteFooter />
    </>
  );
}
