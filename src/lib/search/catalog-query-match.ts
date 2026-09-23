import type { Product } from "@/types/catalog";

const nonProductPattern = /(?:手机壳|保护壳|钢化膜|贴膜|镜头膜|充电器|数据线|支架|维修|更换|屏幕总成|电池总成|模型机|展示模型|仿真机|配件)/i;

const brandAliases = [
  { brand: "apple", aliases: ["apple", "iphone", "苹果"] },
  { brand: "huawei", aliases: ["huawei", "华为"] },
  { brand: "xiaomi", aliases: ["xiaomi", "小米", "redmi", "红米"] },
  { brand: "oppo", aliases: ["oppo"] },
  { brand: "vivo", aliases: ["vivo"] },
] as const;

function compact(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[\s\-_/]+/g, "");
}

function detectedBrands(value: string): string[] {
  const text = compact(value);
  return brandAliases.flatMap(({ brand, aliases }) => aliases.some((alias) => text.includes(compact(alias))) ? [brand] : []);
}

function catalogBrand(product: Product): string {
  const text = compact(product.brand);
  return brandAliases.find(({ aliases }) => aliases.some((alias) => text === compact(alias)))?.brand ?? text;
}

function explicitModel(value: string): string | null {
  const text = compact(value);
  const patterns: readonly { family: string; pattern: RegExp }[] = [
    { family: "iphone", pattern: /iphone(\d+)(promax|pro|plus|max|e)?/ },
    { family: "xiaomi", pattern: /(?:xiaomi|小米)(\d+)(ultra|promax|pro|plus|max|s|t)?/ },
    { family: "redmi", pattern: /(?:redmi|红米)(\d+)(ultra|promax|pro|plus|max|s|t)?/ },
    { family: "mate", pattern: /(?:huawei|华为)?mate(\d+)(ultra|promax|proplus|pro|plus|max)?/ },
    { family: "pura", pattern: /(?:huawei|华为)?pura(\d+)(ultra|promax|proplus|pro|plus|max)?/ },
    { family: "nova", pattern: /(?:huawei|华为)?nova(\d+)(ultra|promax|proplus|pro|plus|max)?/ },
    { family: "findx", pattern: /oppofindx(\d+)(ultra|promax|pro|plus|max)?/ },
    { family: "reno", pattern: /opporeno(\d+)(ultra|promax|pro|plus|max)?/ },
    { family: "vivox", pattern: /vivox(\d+)(ultra|promax|pro|plus|max|s)?/ },
  ];
  for (const { family, pattern } of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    return `${family}:${match[1]}:${match[2] ?? "base"}`;
  }
  return null;
}

/** Applies strict phone identity boundaries only when the query supplies enough identity evidence. */
export function allowsPhoneCatalogMatch(product: Product, query: string): boolean {
  if (product.category !== "phone") return true;
  if (nonProductPattern.test(query)) return false;

  const queryBrands = [...new Set(detectedBrands(query))];
  if (queryBrands.length > 1 || (queryBrands.length === 1 && queryBrands[0] !== catalogBrand(product))) return false;

  const requestedModel = explicitModel(query);
  if (!requestedModel) return true;
  return explicitModel(`${product.brand} ${product.name}`) === requestedModel;
}
