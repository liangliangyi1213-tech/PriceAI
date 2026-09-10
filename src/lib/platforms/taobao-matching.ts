import type { Product } from "@/types/catalog";

import type { LiveTaobaoOffer } from "./taobao-client";

export type TaobaoProductMatch =
  | { status: "matched"; product: Product }
  | { status: "unmatched"; reason: string }
  | { status: "ambiguous"; reason: string }
  | { status: "rejected"; reason: string };

const accessoryPattern = /(?:手机壳|保护壳|钢化膜|贴膜|充电器|数据线|耳机|支架|镜头膜|壳膜|配件)/i;

const brandAliases: Record<string, string[]> = {
  Apple: ["apple", "iphone", "苹果"],
  华为: ["华为", "huawei"],
  小米: ["小米", "xiaomi", "redmi"],
  OPPO: ["oppo"],
  vivo: ["vivo"],
};

function compact(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\-_/]/g, "");
}

function modelKey(value: string): string {
  return compact(value).replace(/^(?:apple|iphone|苹果|华为|huawei|小米|xiaomi|redmi|oppo|vivo)/, "");
}

function detectsKnownModels(title: string, brand: string): string[] {
  const text = compact(title);
  const matches = brand === "Apple"
    ? text.match(/iphone\d+(?:promax|pro|plus|e)?/g) ?? []
    : brand === "小米"
      ? text.match(/(?:xiaomi|小米)\d+(?:ultra|pro|max|s|t)?/g) ?? []
      : [];
  return [...new Set(matches.map(modelKey))];
}

function hasExpectedBrand(offer: LiveTaobaoOffer, product: Product): boolean {
  const aliases = brandAliases[product.brand] ?? [product.brand.toLocaleLowerCase()];
  const source = compact(`${offer.brandName ?? ""} ${offer.title}`);
  return aliases.some((alias) => source.includes(compact(alias)));
}

/**
 * Product-only matching for Taobao Alliance results. Variant matching is
 * intentionally impossible here because the public material API has no SKU data.
 */
export function matchTaobaoPhoneOffer(offer: LiveTaobaoOffer, product: Product): TaobaoProductMatch {
  if (product.category !== "phone") return { status: "unmatched", reason: "当前仅支持手机商品严格匹配。" };
  if (accessoryPattern.test(offer.title)) return { status: "rejected", reason: "商品标题表明其为配件，不能作为手机商品匹配。" };
  if (!hasExpectedBrand(offer, product)) return { status: "unmatched", reason: "商品品牌与目标商品不一致。" };

  const title = compact(offer.title);
  const targetName = compact(product.name);
  const targetModel = modelKey(product.name);
  const detectedModels = detectsKnownModels(offer.title, product.brand);
  const containsTarget = title.includes(targetName) || detectedModels.includes(targetModel);
  if (!containsTarget) return { status: "unmatched", reason: "商品型号与目标商品不一致。" };
  if (detectedModels.length > 0 && !detectedModels.includes(targetModel)) {
    return { status: "unmatched", reason: "商品标题包含冲突型号。" };
  }
  if (detectedModels.some((model) => model !== targetModel)) {
    return { status: "ambiguous", reason: "商品标题同时包含多个型号，无法严格确认同款。" };
  }
  return { status: "matched", product };
}
