import { describe, expect, it } from "vitest";
import { phones } from "@/data/phones";
import type { PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import { classifyPinduoduoGoods, scorePinduoduoRelevance } from "./pinduoduo-relevance";

const product = phones.find((item) => item.slug === "apple-iphone-16")!;
const goods = (goodsName: string, overrides: Partial<PinduoduoGoods> = {}): PinduoduoGoods => ({
  goodsId: "123", goodsSign: null, goodsName, goodsThumbnailUrl: null, goodsImageUrl: null,
  categoryName: "手机", mallName: "商城", merchantType: null, salesTip: null, realtimeSalesTip: null,
  hasCoupon: false, couponPrice: null, couponMinOrderAmount: null, minNormalPrice: 5000,
  promotionRate: null, fetchedAt: new Date("2026-09-05T00:00:00Z"), ...overrides,
});

describe("Pinduoduo subject relevance", () => {
  it.each([
    "钢化膜 手机贴膜", "手机贴膜", "水凝膜", "防窥膜", "屏幕保护贴",
    "手机模型 展示机", "手机模型", "模型机", "机模", "展示机", "样板机",
    "tempered glass", "screen protector", "dummy phone", "display model", "mockup phone",
  ])("rejects protector and non-retail model evidence: %s", (form) => {
    const listing = goods(`Apple iPhone16 Pro ${form}`, { categoryName: null });
    expect(classifyPinduoduoGoods("iphone16pro", phones[0], listing)).toBe("accessory");
    expect(scorePinduoduoRelevance("iphone16pro", phones[0], listing)).toBe(0);
  });
  it.each(["钢化膜", "展示机", "screen protector", "dummy phone"])("rejects non-phone category/option evidence: %s", (form) => {
    expect(classifyPinduoduoGoods("iphone16pro", phones[0], goods("Apple iPhone16 Pro 手机", { categoryName: form }))).toBe("accessory");
    expect(classifyPinduoduoGoods("iphone16pro", phones[0], goods("Apple iPhone16 Pro 手机", { categoryName: null, optName: form }))).toBe("accessory");
  });
  it.each([
    "Apple iPhone16 Pro 全新手机 6.3英寸显示屏",
    "Apple iPhone16 Pro smartphone OLED display",
    "Apple iPhone16 Pro 手机 玻璃背板",
  ])("retains genuine phones with display/glass specifications: %s", (title) => {
    expect(classifyPinduoduoGoods("iphone16pro", phones[0], goods(title, { categoryName: null }))).toBe("subject");
  });
  it.each([
    ["Apple iPhone16 电池", null, "电池"],
    ["Apple iPhone16 原装替换电池", null, null],
    ["Apple iPhone16 电池", null, null],
    ["Apple iPhone16 更换屏幕总成", "手机屏幕", null],
    ["Apple iPhone16 屏幕总成", null, null],
  ])("rejects replacement parts before positive evidence: %s", (title, categoryName, optName) => {
    expect(classifyPinduoduoGoods("iphone16", product, goods(title!, { categoryName, optName: optName ?? undefined }))).toBe("accessory");
  });
  it("requires whole-phone evidence beyond a model or brand", () => {
    expect(classifyPinduoduoGoods("iphone16", product, goods("Apple iPhone16", { categoryName: null }))).toBe("unrelated");
  });
  it.each([
    "Apple iPhone16 全新手机 5000mAh电池 6.1英寸屏幕",
    "Apple iPhone16 智能手机 大容量电池 高清屏幕",
  ])("accepts phones whose ordinary specifications mention parts: %s", (title) => {
    expect(classifyPinduoduoGoods("iphone16", product, goods(title, { categoryName: null }))).toBe("subject");
  });
  it("accepts phone category evidence alongside ordinary battery/display specifications", () => {
    expect(classifyPinduoduoGoods("iphone16", product, goods("Apple iPhone16 5000mAh电池 6.1英寸屏幕"))).toBe("subject");
  });
  it.each(["Apple iPhone16e 全新手机", "Apple iPhone16s 全新手机"])("preserves trailing model letters: %s", (title) => {
    expect(classifyPinduoduoGoods("iphone16", product, goods(title))).toBe("unrelated");
  });
  it("distinguishes Android suffixes and retains compact complete models", () => {
    expect(classifyPinduoduoGoods("x200", phones[4], goods("vivo X200s 手机"))).toBe("unrelated");
    expect(classifyPinduoduoGoods("findx8", phones[3], goods("OPPO FindX8s 手机"))).toBe("unrelated");
    expect(classifyPinduoduoGoods("iphone16pro", phones[0], goods("Apple iPhone16Pro 手机"))).toBe("subject");
  });
  it.each(["iphone16", "  IPHONE 16 ", "iPhone-16", "Apple iPhone16", "苹果 iPhone 16"])("matches compact case-insensitive aliases: %s", (query) => {
    expect(classifyPinduoduoGoods(query, product, goods("苹果 iPhone16 全新手机"))).toBe("subject");
  });
  it.each(["手机壳", "保护膜", "数据线", "充电器", "镜头膜", "支架", "配件", "适用于"])("hard rejects %s despite matching model and category", (word) => {
    expect(classifyPinduoduoGoods("iphone16", product, goods(`iPhone16 ${word}`))).toBe("accessory");
    expect(scorePinduoduoRelevance("iphone16", product, goods(`iPhone16 ${word}`))).toBe(0);
  });
  it("also rejects accessory category evidence", () => {
    expect(classifyPinduoduoGoods("iphone16", product, goods("iPhone16", { optName: "手机配件" }))).toBe("accessory");
  });
  it.each(["iPhone15 手机", "iPhone160 手机", "iPhone 手机", "苹果香蕉", "iPhone16 Pro 手机", "iPhone16 Plus 手机"])("does not confuse unrelated or distinct models: %s", (title) => {
    expect(classifyPinduoduoGoods("iphone16", product, goods(title))).toBe("unrelated");
  });
  it("requires query model and storage tokens as well as product model", () => {
    expect(classifyPinduoduoGoods("iphone17", product, goods("iPhone16 手机"))).toBe("unrelated");
    expect(classifyPinduoduoGoods("iphone16 512gb", product, goods("iPhone16 256GB 手机"))).toBe("unrelated");
  });
  it("does not use an unrelated storage number to satisfy the product model", () => {
    expect(classifyPinduoduoGoods("iphone16", product, goods("Apple iPhone15 16GB 手机"))).toBe("unrelated");
  });
  it("requires all Pro model tokens and excludes Pro Max", () => {
    expect(classifyPinduoduoGoods("iphone16", phones[0], goods("iPhone16 Pro 手机"))).toBe("subject");
    expect(classifyPinduoduoGoods("iphone16", phones[0], goods("iPhone16 手机"))).toBe("unrelated");
    expect(classifyPinduoduoGoods("iphone16", phones[0], goods("iPhone16 Pro Max 手机"))).toBe("unrelated");
  });
  it("uses model boundaries for alphanumeric Android models", () => {
    expect(classifyPinduoduoGoods("x200", phones[4], goods("vivo X200 手机"))).toBe("subject");
    expect(classifyPinduoduoGoods("x200", phones[4], goods("vivo X2000 手机"))).toBe("unrelated");
  });
  it("requires positive model/subject evidence instead of trusting category or description alone", () => {
    expect(classifyPinduoduoGoods("iphone16", product, goods("限时特价", { goodsDescription: "iPhone16 手机" }))).toBe("unrelated");
    expect(classifyPinduoduoGoods("", product, goods("iPhone16 手机"))).toBe("unrelated");
  });
  it("scores deterministically and rewards explicit brand and matching specifications", () => {
    const exact = goods("Apple iPhone16 256GB 黑色 手机");
    const basic = goods("iPhone16 手机");
    const score = scorePinduoduoRelevance("iphone16", product, exact);
    expect(score).toBeGreaterThan(scorePinduoduoRelevance("iphone16", product, basic));
    expect(scorePinduoduoRelevance("iphone16", product, { ...exact })).toBe(score);
    expect(scorePinduoduoRelevance("iphone16", product, goods("iPhone15 手机"))).toBe(0);
  });
});
