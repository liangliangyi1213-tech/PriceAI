import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { phones } from "@/data/phones";
import type { PinduoduoGoods, PinduoduoGoodsResponse } from "@/lib/platforms/pinduoduo-client";
import { discoverOfficialPhoneCategories, runPinduoduoRecallExperiment, summarizePinduoduoRecall } from "./pinduoduo-recall-experiment";

const product = phones.find((item) => item.slug === "apple-iphone-16")!;
const item = (goodsId: string, goodsName: string, categoryName = "手机"): PinduoduoGoods => ({
  goodsId, goodsSign: null, goodsName, goodsThumbnailUrl: null, goodsImageUrl: null,
  categoryName, mallName: null, merchantType: null, salesTip: null, realtimeSalesTip: null,
  hasCoupon: false, couponPrice: null, couponMinOrderAmount: null, minNormalPrice: 5000,
  promotionRate: null, fetchedAt: new Date("2026-09-07T00:00:00Z"),
});
const response = (goods: PinduoduoGoods[], total = goods.length): PinduoduoGoodsResponse => ({
  total, rawCount: goods.length,
  parseDiagnostics: { missingGoodsIdCount: 0, missingNameCount: 0, missingMallNameCount: 0, missingNormalPriceCount: 0, missingGroupPriceCount: 0, noComparablePriceCount: 0 },
  goods,
});

describe("Pinduoduo recall experiment", () => {
  it("reports unique accessories, phone subjects and strict exact matches without product details", () => {
    const summary = summarizePinduoduoRecall([product], "iphone16", response([
      item("1", "iPhone16 手机壳", "手机配件"),
      item("1", "iPhone16 手机壳", "手机配件"),
      item("2", "Apple iPhone16 256GB 全新手机"),
      item("3", "Apple iPhone15 全新手机"),
    ], 1000));
    expect(summary).toEqual({ providerTotal: 1000, returnedCount: 4, uniqueCount: 3, uniqueAccessoryCount: 1, subjectGoodsCount: 2, strictMatchCount: 1 });
    expect(JSON.stringify(summary)).not.toMatch(/iphone|手机壳|goodsId/i);
  });

  it("discovers phone opt and category ids from official names instead of predefined ids", async () => {
    const client = {
      getGoodsOptChildren: vi.fn().mockResolvedValue([
        { id: 88, name: "食品", parentId: 0, level: 1 },
        { id: 321, name: "手机", parentId: 0, level: 1 },
      ]),
      getGoodsCategoryChildren: vi.fn().mockResolvedValue([
        { id: 99, name: "服饰", parentId: 0, level: 1 },
        { id: 654, name: "手机", parentId: 0, level: 1 },
      ]),
    };
    await expect(discoverOfficialPhoneCategories(client)).resolves.toEqual({
      opt: { id: 321, name: "手机", level: 1 },
      category: { id: 654, name: "手机", level: 1 },
    });
  });

  it("runs A/B/C/D independently and retains safe sub-error diagnostics", async () => {
    const client = {
      getGoodsOptChildren: vi.fn().mockResolvedValue([{ id: 321, name: "手机", parentId: 0, level: 1 }]),
      getGoodsCategoryChildren: vi.fn().mockResolvedValue([{ id: 654, name: "手机", parentId: 0, level: 1 }]),
      searchGoods: vi.fn()
        .mockResolvedValueOnce(response([item("1", "iPhone16 手机壳", "手机配件")], 1000))
        .mockResolvedValueOnce(response([item("2", "Apple iPhone16 全新手机")], 10))
        .mockRejectedValueOnce(Object.assign(new Error("private"), { providerCode: 50001, providerSubCode: 60001, providerSubMessage: "缺少备案参数", providerRequestId: "req-3" }))
        .mockResolvedValueOnce(response([item("4", "Apple iPhone16 全新手机")], 8)),
    };
    const result = await runPinduoduoRecallExperiment(client, [product], "iphone16");
    expect(client.searchGoods.mock.calls.map((call) => call[1])).toEqual([
      { limit: 100, page: 1 },
      { limit: 100, page: 1, optId: 321 },
      { limit: 100, page: 1, catId: 654 },
      { limit: 100, page: 1, optId: 321, useCustomized: false },
    ]);
    expect(result.variants.C).toEqual({ success: false, errorCode: 50001, subCode: 60001, subMessage: "缺少备案参数", requestId: "req-3" });
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("keeps runnable variants when one official category lookup fails", async () => {
    const lookupError = Object.assign(new Error("private"), {
      providerCode: 50001, providerSubCode: 70001, providerSubMessage: "接口权限不足", providerRequestId: "opt-request",
    });
    const client = {
      getGoodsOptChildren: vi.fn().mockRejectedValue(lookupError),
      getGoodsCategoryChildren: vi.fn().mockResolvedValue([{ id: 654, name: "手机", parentId: 0, level: 1 }]),
      searchGoods: vi.fn().mockResolvedValue(response([item("2", "Apple iPhone16 全新手机")], 10)),
    };
    const result = await runPinduoduoRecallExperiment(client, [product], "iphone16");
    expect(result.variants.A).toMatchObject({ success: true, strictMatchCount: 1 });
    expect(result.variants.B).toEqual({ success: false, errorCode: 50001, subCode: 70001, subMessage: "接口权限不足", requestId: "opt-request" });
    expect(result.variants.C).toMatchObject({ success: true, strictMatchCount: 1 });
    expect(result.variants.D).toEqual(result.variants.B);
    expect(client.searchGoods).toHaveBeenCalledTimes(2);
  });
});
