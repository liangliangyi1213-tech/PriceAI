import type { PlatformSearchResult } from "@/lib/platforms/types";

import type { NormalizationResult, NormalizedPlatformProduct } from "./types";

const brandRules = [
  { brand: "Apple", aliases: ["apple", "iphone"] },
  { brand: "华为", aliases: ["huawei", "华为"] },
  { brand: "小米", aliases: ["xiaomi", "小米", "redmi"] },
  { brand: "OPPO", aliases: ["oppo"] },
  { brand: "vivo", aliases: ["vivo"] },
] as const;
const colors = ["黑色", "白色", "蓝色", "绿色", "紫色", "金色", "银色", "灰色", "钛金属"];

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function compactText(value: string): string {
  return normalizeText(value).replace(/[\s\-_\/]/g, "");
}

function optionalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch { return null; }
}

function extractStorage(value: string): string | null {
  const match = value.match(/(\d+)\s*(gb|g|tb|t)\b/i);
  if (!match) return null;
  return `${match[1]}${match[2].toUpperCase().startsWith("T") ? "TB" : "GB"}`;
}

function extractColor(value: string): string | null {
  return colors.find((color) => value.includes(color)) ?? null;
}

function extractBrand(value: string): string | null {
  const normalized = normalizeText(value);
  return brandRules.find((rule) => rule.aliases.some((alias) => normalized.includes(alias)))?.brand ?? null;
}

function extractModel(title: string, externalProductId: string, brand: string | null): string | null {
  const source = `${title} ${externalProductId.replace(/[-_]/g, " ")}`;
  const normalized = normalizeText(source)
    .replace(/\b(京东|淘宝|拼多多|官方|正品|自营|旗舰店|国行)\b/g, " ")
    .replace(/(apple|iphone|huawei|xiaomi|redmi|oppo|vivo|华为|小米)/gi, " ")
    .replace(/\d+\s*(gb|g|tb|t)\b/gi, " ");
  const withoutColor = colors.reduce((text, color) => text.replaceAll(color, " "), normalized).replace(/\s+/g, " ").trim();
  if (brand === "Apple") {
    const apple = source.match(/iphone\s*([\d]+(?:\s*pro(?:\s*max)?)?)/i);
    if (apple) return `iPhone ${apple[1].replace(/\s+/g, " ").replace(/\bpro\b/i, "Pro")}`;
  }
  if (!withoutColor) return null;
  const model = withoutColor.replace(/\b(256|512|128|1024)\b/g, " ").replace(/\s+/g, " ").trim();
  return model || null;
}

export function normalizePlatformSearchResult(input: PlatformSearchResult, collectedAt = new Date().toISOString()): NormalizationResult {
  const externalProductId = input.externalProductId?.trim();
  const title = input.title?.trim().replace(/\s+/g, " ");
  const shopName = input.shopName?.trim().replace(/\s+/g, " ");
  if (!externalProductId || !title || !shopName) return { ok: false, rejection: { input, reason: "缺少平台商品的必要标识信息。" } };
  if (!Number.isFinite(input.price) || input.price <= 0) return { ok: false, rejection: { input, reason: "平台商品价格无效。" } };
  if (!Number.isFinite(Date.parse(collectedAt))) return { ok: false, rejection: { input, reason: "采集时间无效。" } };
  const allText = `${title} ${externalProductId}`;
  const storage = extractStorage(allText);
  const color = extractColor(allText);
  const brand = extractBrand(allText);
  const model = extractModel(title, externalProductId, brand);
  const rating = Number.isFinite(input.rating) && (input.rating ?? 0) >= 0 && (input.rating ?? 0) <= 5 ? input.rating! : null;
  const sales = Number.isFinite(input.sales) && (input.sales ?? 0) >= 0 ? Math.floor(input.sales!) : null;
  const originalPrice = Number.isFinite(input.originalPrice) && (input.originalPrice ?? 0) >= input.price ? input.originalPrice! : null;
  const value: NormalizedPlatformProduct = {
    platform: input.platform, externalProductId, externalVariantId: input.externalVariantId?.trim() || null, title,
    normalizedTitle: compactText(title), brand, model, storage, color, price: input.price, originalPrice, currency: "CNY", shopName,
    rating, sales, imageUrl: optionalUrl(input.imageUrl), productUrl: optionalUrl(input.productUrl), collectedAt: new Date(collectedAt).toISOString(),
  };
  return { ok: true, value };
}
