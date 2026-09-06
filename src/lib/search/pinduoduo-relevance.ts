import type { PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import type { Product } from "@/types/catalog";

const ACCESSORIES = /手机壳|保护膜|钢化膜|贴膜|水凝膜|防窥膜|屏幕保护贴|数据线|充电器|镜头膜|支架|配件|适用于|\b(?:tempered[\s-]+glass|screen[\s-]+protector)\b/i;
// Whole-phone wording also occurs in dummy/display listings. Their explicit
// form takes precedence over model matches and positive phone/category words.
const NON_RETAIL_MODELS = /手机模型|模型机|机模|展示机|样板机|\b(?:dummy[\s-]+(?:phone|model)|display[\s-]+model|mockup[\s-]+phone)\b/i;
const MODEL_SUFFIXES = new Set(["pro", "max", "plus", "ultra", "mini", "lite", "se"]);
const BRAND_ALIASES: [RegExp, string][] = [
  [/苹果|apple/gi, "apple"], [/华为|huawei/gi, "huawei"],
  [/小米|xiaomi/gi, "xiaomi"], [/红米|redmi/gi, "redmi"],
  [/荣耀|honor/gi, "honor"], [/三星|samsung/gi, "samsung"],
];

function normalizedText(value: string): string {
  let normalized = value.normalize("NFKC").toLowerCase();
  for (const [pattern, replacement] of BRAND_ALIASES) normalized = normalized.replace(pattern, ` ${replacement} `);
  return normalized;
}

/** Only explicit aliases and token boundaries; never fuzzy-match a model number. */
export function pinduoduoTokens(value: string): string[] {
  return normalizedText(value).replace(/promax/g, "pro max").match(/[a-z]+|\d+(?:\.\d+)?|[\u3400-\u9fff]+/g) ?? [];
}

function includesTokens(haystack: string[], needles: string[]): boolean {
  return needles.length > 0 && needles.every((needle) => haystack.some((token) =>
    /[\u3400-\u9fff]/.test(needle) ? token.includes(needle) : token === needle));
}

function includesModel(title: string, model: string[]): boolean {
  // Preserve adjacent letters at the original text boundary: 16e and X200s
  // cannot become 16 or X200 merely because tokenization split the suffix.
  const phrase = model.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\p{P}]*");
  return model.length > 0 && new RegExp(`(?<![a-z0-9])${phrase}(?![a-z0-9])`, "u").test(normalizedText(title));
}

function hasPhoneWords(text: string): boolean {
  return /手机|智能机|\bphone\b|smartphone/i.test(text);
}

function isReplacementPart(goods: PinduoduoGoods): boolean {
  const category = `${goods.categoryName ?? ""} ${goods.optName ?? ""}`;
  if (/电池|屏幕|总成|零件|维修/.test(category)) return true;
  const title = goods.goodsName;
  if (/(?:替换|更换|维修|拆机|手机)\s*(?:电池|屏幕)|(?:电池|屏幕)\s*(?:总成|替换|更换|维修)/.test(title)) return true;
  // A battery/screen noun without a whole-phone title is part evidence. A
  // complete phone's ordinary capacity/display specifications remain allowed.
  const withoutSpecifications = title.replace(/(?:\d+(?:\.\d+)?\s*(?:mAh|毫安时|毫安|英寸)|大容量|长续航|高清|高刷|AMOLED|OLED|LCD|原彩)\s*(?:电池|屏幕)/gi, "");
  return /电池|屏幕/.test(withoutSpecifications) && !hasPhoneWords(title);
}

function hasPhoneEvidence(goods: PinduoduoGoods): boolean {
  return hasPhoneWords(`${goods.goodsName} ${goods.categoryName ?? ""} ${goods.optName ?? ""}`);
}

export function classifyPinduoduoGoods(query: string, product: Product, goods: PinduoduoGoods): "subject" | "accessory" | "unrelated" {
  const itemEvidence = [goods.goodsName, goods.categoryName, goods.optName].join(" ");
  if (ACCESSORIES.test(itemEvidence) || NON_RETAIL_MODELS.test(itemEvidence) || isReplacementPart(goods)) return "accessory";
  const title = pinduoduoTokens(goods.goodsName);
  const model = pinduoduoTokens(product.name);
  const queryTokens = pinduoduoTokens(query);
  if (!queryTokens.length || !includesModel(goods.goodsName, model)) return "unrelated";
  // A Pro/Max/Plus listing must not be attached to its cheaper base model.
  if (title.some((token) => MODEL_SUFFIXES.has(token) && !model.includes(token))) return "unrelated";
  const brand = pinduoduoTokens(product.brand);
  const queryEvidence = [...title, ...brand];
  if (!includesTokens(queryEvidence, queryTokens) || !hasPhoneEvidence(goods)) return "unrelated";
  return "subject";
}

export function scorePinduoduoRelevance(query: string, product: Product, goods: PinduoduoGoods): number {
  if (classifyPinduoduoGoods(query, product, goods) !== "subject") return 0;
  const title = pinduoduoTokens(goods.goodsName);
  const has = (text: string) => includesTokens(title, pinduoduoTokens(text));
  const modelPhrase = pinduoduoTokens(product.name).join(" ");
  // Passing the required model/query/subject gates earns 100. Auxiliary evidence only adds weight.
  return 100
    + (title.join(" ").includes(modelPhrase) ? 30 : 0)
    + (has(product.brand) ? 20 : 0)
    + (has(query) ? 20 : 0)
    + (product.variants.some((variant) => has(variant.storage)) ? 10 : 0)
    + (product.variants.some((variant) => has(variant.color)) ? 5 : 0)
    + (Object.values(product.specs).some(has) ? 5 : 0)
    + (/手机|智能机|phone/i.test(`${goods.categoryName ?? ""} ${goods.optName ?? ""}`) ? 5 : 0)
    + (goods.goodsDescription && pinduoduoTokens(goods.goodsDescription).join(" ").includes(modelPhrase) ? 2 : 0);
}
