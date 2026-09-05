import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  fenToYuan,
  parsePinduoduoRecommendResponse,
  PinduoduoClient,
  signPinduoduoRequest,
} from "./pinduoduo-client";

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
      }],
    });
  });

  it("rejects provider error responses without exposing their raw message", () => {
    expect(() => parsePinduoduoRecommendResponse({
      error_response: { error_code: 10000, error_msg: "secret provider detail" },
    })).toThrowError("拼多多平台请求失败，请稍后重试。");
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
});
