import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";

import { allowsPhoneCatalogMatch, matchPhoneCatalogProductIdentity } from "./catalog-query-match";

const iphone16 = phones.find((product) => product.slug === "apple-iphone-16")!;
const iphone16Pro = phones.find((product) => product.slug === "apple-iphone-16-pro")!;
const xiaomi15 = phones.find((product) => product.slug === "xiaomi-15")!;

describe("strict phone catalog query matching", () => {
  it("keeps explicit base, Pro, Pro Max, Plus, and Ultra model suffixes separate", () => {
    expect(allowsPhoneCatalogMatch(iphone16, "iPhone 16")).toBe(true);
    expect(allowsPhoneCatalogMatch(iphone16Pro, "iPhone 16")).toBe(false);
    expect(allowsPhoneCatalogMatch(iphone16, "iPhone 16 Pro")).toBe(false);
    expect(allowsPhoneCatalogMatch(iphone16Pro, "iPhone 16 Pro Max")).toBe(false);
    expect(allowsPhoneCatalogMatch(iphone16, "iPhone 16 Plus")).toBe(false);
    expect(allowsPhoneCatalogMatch(xiaomi15, "小米 15 Ultra")).toBe(false);
  });

  it("normalizes Chinese and English brand aliases without weakening the model boundary", () => {
    expect(allowsPhoneCatalogMatch(xiaomi15, "小米15")).toBe(true);
    expect(allowsPhoneCatalogMatch(xiaomi15, "Xiaomi 15")).toBe(true);
    expect(allowsPhoneCatalogMatch(xiaomi15, "小米15 Pro")).toBe(false);
  });

  it("does not detect an English brand alias inside another word", () => {
    expect(matchPhoneCatalogProductIdentity(iphone16, "notxiaomi Apple"))
      .toEqual({ status: "matched", evidenceSource: "title_only", productId: iphone16.id });
  });

  it("rejects an explicitly different brand while retaining broad brand searches", () => {
    expect(allowsPhoneCatalogMatch(xiaomi15, "Apple 小米15")).toBe(false);
    expect(allowsPhoneCatalogMatch(iphone16, "Apple")).toBe(true);
    expect(allowsPhoneCatalogMatch(iphone16Pro, "iPhone")).toBe(true);
  });

  it("does not treat accessories, repair parts, or display models as catalog phones", () => {
    expect(allowsPhoneCatalogMatch(iphone16Pro, "iPhone 16 Pro 手机壳")).toBe(false);
    expect(allowsPhoneCatalogMatch(iphone16Pro, "iPhone 16 Pro 屏幕维修总成")).toBe(false);
    expect(allowsPhoneCatalogMatch(iphone16Pro, "iPhone 16 Pro 模型机")).toBe(false);
  });

  it("marks mixed mutually exclusive models as ambiguous", () => {
    expect(matchPhoneCatalogProductIdentity(iphone16Pro, "Apple iPhone 16 Pro / iPhone 16 Pro Max 多型号可选"))
      .toEqual({ status: "ambiguous", evidenceSource: "title_only", productId: null });
    expect(matchPhoneCatalogProductIdentity(iphone16, "Apple iPhone 16 / 16 Plus 多型号可选"))
      .toEqual({ status: "ambiguous", evidenceSource: "title_only", productId: null });
    expect(matchPhoneCatalogProductIdentity(xiaomi15, "小米 15 / 15 Ultra 多型号可选"))
      .toEqual({ status: "ambiguous", evidenceSource: "title_only", productId: null });
  });
});
