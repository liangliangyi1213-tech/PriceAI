import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  fenToYuan,
  parsePinduoduoRecommendResponse,
  parsePinduoduoSearchResponse,
  PinduoduoClient,
  signPinduoduoRequest,
} from "./pinduoduo-client";
import type { PinduoduoRecommendedGoods } from "./pinduoduo-client";

const rawGoods = {
  goods_id: 123456789,
  goods_name: "测试商品 500g 原味",
  goods_thumbnail_url: "https://img.example.test/thumb.jpg",
  goods_image_url: "https://img.example.test/main.jpg",
  category_name: "食品",
  mall_name: "测试店铺",
  merchant_type: 3,
  sales_tip: "10万+",
  realtime_sales_tip: "12万+",
  has_coupon: true,
  coupon_price: 8599,
  coupon_min_order_amount: 9999,
  min_normal_price: 10999,
  promotion_rate: 250,
  goods_sign: "test_goods_sign",
};

const rawSearchGoods = {
  ...rawGoods,
  min_normal_price: 19999,
  min_group_price: 15999,
  extra_coupon_amount: 1200,
  opt_name: "零食优选",
  cat_ids: [11, 22],
  goods_desc: "独立包装的测试商品",
};

const legacyRecommendedGoods: PinduoduoRecommendedGoods = {
  goodsId: "123456789",
  goodsSign: "test_goods_sign",
  goodsName: "测试商品 500g 原味",
  goodsThumbnailUrl: "https://img.example.test/thumb.jpg",
  goodsImageUrl: "https://img.example.test/main.jpg",
  categoryName: "食品",
  mallName: "测试店铺",
  merchantType: 3,
  salesTip: "10万+",
  realtimeSalesTip: "12万+",
  hasCoupon: true,
  couponPrice: 85.99,
  couponMinOrderAmount: 99.99,
  minNormalPrice: 109.99,
  promotionRate: 250,
};

describe("Pinduoduo API signing", () => {
  it("sorts parameter names, wraps them with the secret and returns uppercase MD5", () => {
    expect(signPinduoduoRequest({
      type: "pdd.ddk.goods.recommend.get",
      timestamp: "1600000000",
      data_type: "JSON",
      client_id: "test_client",
    }, "test_secret")).toBe("759B735FF4783E5EE390824C3CBA46DF");
  });
});

describe("Pinduoduo legacy type compatibility", () => {
  it("accepts a recommended-good object that uses only the pre-search fields", () => {
    expect(legacyRecommendedGoods.goodsId).toBe("123456789");
  });
});

describe("Pinduoduo response parsing", () => {
  it("converts documented fen-denominated money fields to yuan", () => {
    expect(fenToYuan(10999)).toBe(109.99);
    expect(fenToYuan(0)).toBe(0);
    expect(fenToYuan("invalid")).toBeNull();
  });

  it("parses the documented recommendation fields without inventing values", () => {
    expect(parsePinduoduoRecommendResponse({
      goods_basic_detail_response: { total: 734, list: [rawGoods] },
    })).toEqual({
      total: 734,
      goods: [{
        goodsId: "123456789",
        goodsSign: "test_goods_sign",
        goodsName: "测试商品 500g 原味",
        goodsThumbnailUrl: "https://img.example.test/thumb.jpg",
        goodsImageUrl: "https://img.example.test/main.jpg",
        categoryName: "食品",
        mallName: "测试店铺",
        merchantType: 3,
        salesTip: "10万+",
        realtimeSalesTip: "12万+",
        hasCoupon: true,
        couponPrice: 85.99,
        couponMinOrderAmount: 99.99,
        minNormalPrice: 109.99,
        promotionRate: 250,
        fetchedAt: expect.any(Date),
      }],
    });
  });

  it("rejects provider error responses without exposing their raw message", () => {
    expect(() => parsePinduoduoRecommendResponse({
      error_response: { error_code: 10000, error_msg: "secret provider detail" },
    })).toThrowError("拼多多平台请求失败，请稍后重试。");
  });
});

describe("Pinduoduo search response parsing", () => {
  it("parses the documented search envelope and converts its fen money fields", () => {
    expect(parsePinduoduoSearchResponse({
      goods_search_response: { total_count: 23, goods_list: [rawSearchGoods] },
    })).toEqual({
      total: 23,
      goods: [expect.objectContaining({
        goodsId: "123456789",
        minNormalPrice: 199.99,
        minGroupPrice: 159.99,
        couponPrice: 85.99,
        couponMinOrderAmount: 99.99,
        extraCouponAmount: 12,
        optName: "零食优选",
        catIds: [11, 22],
        goodsDescription: "独立包装的测试商品",
        fetchedAt: expect.any(Date),
      })],
    });
  });

  it("does not invent missing optional search fields", () => {
    const result = parsePinduoduoSearchResponse({
      goods_search_response: { goods_list: [rawGoods] },
    });

    expect(result.goods[0]).not.toHaveProperty("minGroupPrice");
    expect(result.goods[0]).not.toHaveProperty("extraCouponAmount");
    expect(result.goods[0]).not.toHaveProperty("optName");
    expect(result.goods[0]).not.toHaveProperty("catIds");
    expect(result.goods[0]).not.toHaveProperty("goodsDescription");
  });
});

describe("PinduoduoClient", () => {
  it("posts a signed recommendation request to the official router without logging credentials", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      goods_basic_detail_response: { total: 734, list: [rawGoods] },
    }));
    const client = new PinduoduoClient({
      clientId: "test_client",
      clientSecret: "test_secret",
      pid: "test_pid",
      fetcher,
      now: () => new Date("2020-09-13T12:26:40.000Z"),
    });

    const result = await client.getRecommendedGoods({ limit: 20, offset: 0 });

    expect(result.total).toBe(734);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://gw-api.pinduoduo.com/api/router");
    expect(init?.method).toBe("POST");
    const body = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(body)).toMatchObject({
      type: "pdd.ddk.goods.recommend.get",
      client_id: "test_client",
      pid: "test_pid",
      timestamp: "1600000000",
      data_type: "JSON",
      sign: expect.stringMatching(/^[A-F0-9]{32}$/),
    });
  });

  it("posts a signed goods search request with the documented paging parameters", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      goods_search_response: { total_count: 23, goods_list: [rawSearchGoods] },
    }));
    const client = new PinduoduoClient({
      clientId: "test_client",
      clientSecret: "test_secret",
      pid: "test_pid",
      fetcher,
      now: () => new Date("2020-09-13T12:26:40.000Z"),
    });

    const result = await client.searchGoods("测试商品", { limit: 30, page: 2 });

    expect(result.goods[0]).toMatchObject({ fetchedAt: new Date("2020-09-13T12:26:40.000Z") });
    const [, init] = fetcher.mock.calls[0];
    const body = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(body)).toMatchObject({
      type: "pdd.ddk.goods.search",
      client_id: "test_client",
      pid: "test_pid",
      timestamp: "1600000000",
      keyword: "测试商品",
      page: "2",
      page_size: "30",
      sign: expect.stringMatching(/^[A-F0-9]{32}$/),
    });
  });

  it("passes the caller abort signal to the upstream fetch", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ goods_search_response: { goods_list: [] } }));
    const client = new PinduoduoClient({ clientId: "test_client", clientSecret: "test_secret", pid: "test_pid", fetcher });

    await client.searchGoods("测试商品", {}, { signal: controller.signal });

    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("turns failed search responses into safe errors", async () => {
    const client = new PinduoduoClient({
      clientId: "test_client",
      clientSecret: "test_secret",
      pid: "test_pid",
      fetcher: vi.fn<typeof fetch>(async () => Response.json({
        error_response: { error_msg: "secret provider detail" },
      })),
    });

    await expect(client.searchGoods("测试商品")).rejects.toThrowError("拼多多平台请求失败，请稍后重试。");
  });

  it("normalizes non-finite search paging inputs to finite defaults", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      goods_search_response: { goods_list: [] },
    }));
    const client = new PinduoduoClient({
      clientId: "test_client",
      clientSecret: "test_secret",
      pid: "test_pid",
      fetcher,
    });

    await client.searchGoods("测试商品", { limit: Number.POSITIVE_INFINITY, page: Number.NaN });

    const [, init] = fetcher.mock.calls[0];
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toMatchObject({
      page: "1",
      page_size: "20",
    });
  });

  it("normalizes non-finite recommendation bounds to finite defaults", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      goods_basic_detail_response: { list: [] },
    }));
    const client = new PinduoduoClient({
      clientId: "test_client",
      clientSecret: "test_secret",
      pid: "test_pid",
      fetcher,
    });

    await client.getRecommendedGoods({ limit: Number.NaN, offset: Number.NEGATIVE_INFINITY });

    const [, init] = fetcher.mock.calls[0];
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toMatchObject({
      limit: "20",
      offset: "0",
    });
  });
});
