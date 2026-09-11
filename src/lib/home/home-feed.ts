import { searchCategoryIds, searchCategoryRegistry } from "@/lib/search/category-context";
import { formatPrice } from "@/lib/pricing/offers";
import type { ProductSearchRow } from "@/lib/search/products";

export type HomeRecommendationSignals = {
  searchKeywords?: readonly string[];
  viewedCategories?: readonly string[];
  comparedProductSlugs?: readonly string[];
  budgetRange?: { min?: number; max?: number };
};

export type HomeRecommendationFeed = {
  mode: "fallback" | "personalized";
  heading: string;
  eyebrow: string;
  description: string;
  items: ProductSearchRow[];
};

export type HomeRecommendationOptions = {
  signals?: HomeRecommendationSignals;
  personalizedRows?: readonly ProductSearchRow[];
  excludedProductIds?: readonly string[];
};

export type HomeDailyHighlight = {
  row: ProductSearchRow;
  reason: string;
};

export type DiscoveryItem = {
  id: string;
  href: string;
  title: string;
  image: string | null;
  category: string;
  reasonType: "价格关注" | "性价比发现" | "多平台价差" | "稳定低价" | "商品关注";
  reasonText: string;
};

/**
 * Homepage recommendations intentionally use an honest catalog fallback today.
 * The signals boundary is kept explicit so a future recommendation service can
 * replace this policy without coupling React components to phone-specific data.
 */
export function buildHomeRecommendationFeed(
  rows: readonly ProductSearchRow[],
  options: HomeRecommendationOptions = {},
): HomeRecommendationFeed {
  const excluded = new Set(options.excludedProductIds ?? []);
  const fallbackRows = rows.filter((row) => !excluded.has(row.product.id));
  const hasSignals = Boolean(
    options.signals?.searchKeywords?.some((keyword) => keyword.trim())
    || options.signals?.viewedCategories?.some((category) => category.trim())
    || options.signals?.comparedProductSlugs?.some((slug) => slug.trim())
    || (options.signals?.budgetRange
      && (Number.isFinite(options.signals.budgetRange.min) || Number.isFinite(options.signals.budgetRange.max))),
  );
  const personalizedRows = options.personalizedRows?.filter((row) => !excluded.has(row.product.id)) ?? [];

  if (hasSignals && personalizedRows.length > 0) {
    return {
      mode: "personalized",
      heading: "为你推荐",
      eyebrow: "根据你的购物偏好",
      description: "结合当前可用的搜索、浏览或对比偏好，为你整理更相关的商品。",
      items: personalizedRows.slice(0, 4),
    };
  }

  return {
    mode: "fallback",
    heading: "热门值得买",
    eyebrow: "当前热门",
    description: "暂无足够的个性化数据，先为你展示当前已收录商品中的热门值得买。",
    items: fallbackRows.slice(0, 4),
  };
}

function getComparablePlatformCount(row: ProductSearchRow): number {
  return row.product.variants.reduce((highest, variant) => {
    const count = new Set(variant.offers.map((offer) => offer.platform)).size;
    return Math.max(highest, count);
  }, 0);
}

export function buildHomeDailyHighlights(
  rows: readonly ProductSearchRow[],
  limit = 2,
): HomeDailyHighlight[] {
  return rows.slice(0, limit).map((row) => {
    const platformCount = getComparablePlatformCount(row);
    const reason = platformCount > 1
      ? `已收录 ${platformCount} 个平台报价，可核对同规格价格`
      : row.valueScore !== null
        ? `当前 PriceAI 性价比分 ${row.valueScore} 分`
        : "当前已有可核验的商品与报价信息";

    return { row, reason };
  });
}

function getCategoryLabel(catalogCategory: string): string {
  const config = searchCategoryIds
    .filter((id) => id !== "all")
    .map((id) => searchCategoryRegistry[id])
    .find((category) => category.catalogCategories.includes(catalogCategory));

  return config?.label ?? searchCategoryRegistry.all.label;
}

function normalizeCatalogImage(image: string): string | null {
  const normalized = image.trim();
  if (!normalized || normalized === "/phone-placeholder.svg") return null;
  return /^(\/[^/]|https:\/\/)/.test(normalized) ? normalized : null;
}

export function buildHomeDiscoveryItems(rows: readonly ProductSearchRow[]): DiscoveryItem[] {
  return rows.slice(0, 4).map((row, index) => {
    const comparableVariant = row.product.variants.find((variant) => variant.id === row.lowestOffer?.variantId);
    const validPrices = comparableVariant?.offers
      .map((offer) => offer.price)
      .filter((price) => Number.isFinite(price) && price >= 0) ?? [];
    const platformCount = comparableVariant
      ? new Set(comparableVariant.offers.map((offer) => offer.platform)).size
      : 0;
    const priceSpread = validPrices.length > 1 ? Math.max(...validPrices) - Math.min(...validPrices) : 0;
    const hasScore = row.valueScore !== null;
    const useSpreadStory = index % 3 === 1 && platformCount > 1 && priceSpread > 0;
    const usePriceStory = index % 3 === 2 && row.lowestOffer !== undefined;
    const useScoreStory = !useSpreadStory && !usePriceStory && hasScore;
    const typeLabel = useSpreadStory
      ? "多平台价差"
      : usePriceStory
        ? "价格关注"
        : useScoreStory
          ? "性价比发现"
          : "商品关注";
    const reason = useSpreadStory
      ? `同规格已收录 ${platformCount} 个平台报价，最高与最低相差 ${formatPrice(priceSpread)}`
      : usePriceStory
        ? `当前最低正式报价 ${formatPrice(row.lowestOffer!.price)}，可继续查看报价明细`
        : useScoreStory
      ? `当前 PriceAI 性价比分 ${row.valueScore} 分，可继续查看评分依据`
          : "已进入 PriceAI 商品目录，可继续查看已核验信息";

    return {
      id: row.product.id,
      href: `/products/${row.product.slug}`,
      title: row.product.name,
      image: normalizeCatalogImage(row.product.image),
      category: getCategoryLabel(row.product.category),
      reasonType: typeLabel,
      reasonText: reason,
    };
  });
}
