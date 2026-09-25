import type { Product } from "@/types/catalog";
import type { ProductMatchResult } from "@/lib/matching/evidence";

const nonProductPattern = /(?:手机壳|保护壳|钢化膜|贴膜|镜头膜|充电器|数据线|支架|维修|更换|屏幕总成|电池总成|模型机|展示模型|仿真机|配件)/i;

const brandAliases = [
  { brand: "apple", aliases: ["apple", "苹果"] },
  { brand: "huawei", aliases: ["huawei", "华为"] },
  { brand: "xiaomi", aliases: ["xiaomi", "小米"] },
  { brand: "redmi", aliases: ["redmi", "红米"] },
  { brand: "oppo", aliases: ["oppo"] },
  { brand: "vivo", aliases: ["vivo"] },
] as const;

// Query aliases may include a product line such as iPhone. This is separate
// from Catalog brand identity, where Apple remains the brand.
const queryBrandAliasPatterns: readonly { brand: string; pattern: RegExp }[] = [
  { brand: "apple", pattern: /(?<![a-z])(?:apple|iphone)(?![a-z])|苹果/giu },
  { brand: "huawei", pattern: /(?<![a-z])huawei(?![a-z])|华为/giu },
  { brand: "xiaomi", pattern: /(?<![a-z])xiaomi(?![a-z])|小米/giu },
  { brand: "redmi", pattern: /(?<![a-z])redmi(?![a-z])|红米/giu },
  { brand: "oppo", pattern: /(?<![a-z])oppo(?![a-z])/giu },
  { brand: "vivo", pattern: /(?<![a-z])vivo(?![a-z])/giu },
];

const brandLabels: Readonly<Record<string, string>> = {
  apple: "Apple",
  huawei: "华为",
  xiaomi: "小米",
  redmi: "REDMI",
  oppo: "OPPO",
  vivo: "vivo",
};

/** Canonicalizes only explicit, known brand aliases for Product search text. */
export function normalizeCatalogBrandAliases(value: string): string {
  return queryBrandAliasPatterns.reduce(
    (normalized, { brand, pattern }) => normalized.replace(pattern, brand),
    value.normalize("NFKC").toLocaleLowerCase(),
  );
}

function compact(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[\s\-_/]+/g, "");
}

function detectedBrands(value: string): string[] {
  const text = value.normalize("NFKC").toLocaleLowerCase();
  return queryBrandAliasPatterns.flatMap(({ brand, pattern }) => {
    pattern.lastIndex = 0;
    const matched = pattern.test(text);
    pattern.lastIndex = 0;
    return matched ? [brand] : [];
  });
}

function catalogBrand(product: Product): string {
  const productLineBrands = detectedBrands(product.name);
  if (productLineBrands.includes("redmi")) return "redmi";
  const text = compact(product.brand);
  return brandAliases.find(({ aliases }) => aliases.some((alias) => text === compact(alias)))?.brand ?? text;
}

export function catalogProductBrandLabel(product: Product): string {
  const identity = catalogBrand(product);
  return brandLabels[identity] ?? product.brand;
}

export function matchesCatalogProductBrand(product: Product, requestedBrand: string): boolean {
  const requested = compact(requestedBrand);
  const identity = brandAliases.find(({ aliases }) => aliases.some((alias) => requested === compact(alias)))?.brand ?? requested;
  return catalogBrand(product) === identity;
}

function normalizedModelText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[-_]+/g, " ");
}

function addMatches(
  target: Set<string>,
  text: string,
  family: string,
  pattern: RegExp,
) {
  for (const match of text.matchAll(pattern)) {
    target.add(`${family}:${match[1]}:${(match[2] ?? "base").replace(/\s+/g, "")}`);
  }
}

function addShorthandMatches(
  target: Set<string>,
  text: string,
  family: string,
  suffixPattern: string,
) {
  const pattern = new RegExp(`(?:[/、|,，]|\\b或\\b)\\s*(\\d+)\\s*(${suffixPattern})?`, "gi");
  addMatches(target, text, family, pattern);
}

function explicitModels(value: string): string[] {
  const text = normalizedModelText(value);
  const matches = new Set<string>();

  addMatches(matches, text, "iphone", /(?<![a-z])iphone\s*(\d+)\s*(pro\s*max|pro|plus|max|e)?/gi);
  addMatches(matches, text, "xiaomi", /(?:(?<![a-z])xiaomi(?![a-z])|小米)\s*(\d+)\s*(ultra|pro\s*max|pro|plus|max|s|t)?/gi);
  addMatches(matches, text, "redmi", /(?:(?<![a-z])redmi(?![a-z])|红米)\s*(\d+)\s*(ultra|pro\s*max|pro|plus|max|s|t)?/gi);
  addMatches(matches, text, "mate", /(?:(?<![a-z])huawei(?![a-z])|华为)?\s*mate\s*(\d+)\s*(ultra|pro\s*max|pro\s*plus|pro|plus|max)?/gi);
  addMatches(matches, text, "pura", /(?:(?<![a-z])huawei(?![a-z])|华为)?\s*pura\s*(\d+)\s*(ultra|pro\s*max|pro\s*plus|pro|plus|max)?/gi);
  addMatches(matches, text, "nova", /(?:(?<![a-z])huawei(?![a-z])|华为)?\s*nova\s*(\d+)\s*(ultra|pro\s*max|pro\s*plus|pro|plus|max)?/gi);
  addMatches(matches, text, "findx", /(?<![a-z])oppo(?![a-z])\s*find\s*x\s*(\d+)\s*(ultra|pro\s*max|pro|plus|max)?/gi);
  addMatches(matches, text, "reno", /(?<![a-z])oppo(?![a-z])\s*reno\s*(\d+)\s*(ultra|pro\s*max|pro|plus|max)?/gi);
  addMatches(matches, text, "vivox", /(?<![a-z])vivo(?![a-z])\s*x\s*(\d+)\s*(ultra|pro\s*max|pro|plus|max|s)?/gi);

  // Platform titles often abbreviate the second model (for example
  // "iPhone 16 / 16 Plus"). Separators make this safe from storage text.
  const brands = detectedBrands(text);
  if (brands.includes("apple")) addShorthandMatches(matches, text, "iphone", "pro\\s*max|pro|plus|max|e");
  if (brands.includes("xiaomi")) {
    if (/(?:(?<![a-z])redmi(?![a-z])|红米)/i.test(text)) {
      addShorthandMatches(matches, text, "redmi", "ultra|pro\\s*max|pro|plus|max|s|t");
    } else {
      addShorthandMatches(matches, text, "xiaomi", "ultra|pro\\s*max|pro|plus|max|s|t");
    }
  }

  return [...matches];
}

/**
 * Resolves only Product identity. Multiple explicit models are ambiguous even
 * when one of them matches the requested Catalog Product.
 */
export function matchPhoneCatalogProductIdentity(product: Product, query: string): ProductMatchResult {
  if (product.category !== "phone") {
    return { status: "matched", evidenceSource: "title_only", productId: product.id };
  }
  if (nonProductPattern.test(query)) {
    return { status: "not_matched", evidenceSource: "title_only", productId: null };
  }

  const queryBrands = [...new Set(detectedBrands(query))];
  if (queryBrands.length > 1) {
    return { status: "ambiguous", evidenceSource: "title_only", productId: null };
  }
  if (queryBrands.length === 1 && queryBrands[0] !== catalogBrand(product)) {
    return { status: "not_matched", evidenceSource: "title_only", productId: null };
  }

  const requestedModels = explicitModels(query);
  if (requestedModels.length > 1) {
    return { status: "ambiguous", evidenceSource: "title_only", productId: null };
  }
  if (requestedModels.length === 0) {
    return { status: "matched", evidenceSource: "title_only", productId: product.id };
  }

  const catalogModels = explicitModels(`${product.brand} ${product.name}`);
  if (catalogModels.length !== 1 || catalogModels[0] !== requestedModels[0]) {
    return { status: "not_matched", evidenceSource: "title_only", productId: null };
  }
  return { status: "matched", evidenceSource: "title_only", productId: product.id };
}

/** Applies strict phone identity boundaries only when the query supplies enough identity evidence. */
export function allowsPhoneCatalogMatch(product: Product, query: string): boolean {
  return matchPhoneCatalogProductIdentity(product, query).status === "matched";
}
