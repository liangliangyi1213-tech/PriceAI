import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { formatTaobaoTimestamp, parseTaobaoMaterialResponse, signTaobaoRequest, TaobaoClient } from "./taobao-client";

const rawItem = {
  item_id: 123456,
  title: "Apple iPhone 16 Pro 国行全新手机",
  short_title: "iPhone 16 Pro",
  brand_name: "Apple",
  category_id: 1512,
  category_name: "手机",
  shop_title: "Apple 授权店",
  seller_id: 789012,
  pict_url: "https://img.example.test/iphone.jpg",
  small_images: { string: ["https://img.example.test/iphone-small.jpg"] },
  reserve_price: "8999.00",
  zk_final_price: "7999.00",
  final_promotion_price: "7499.00",
  promotion_tag_list: [{ tag_name: "官方立减" }, { tag_name: "地区补贴" }],
  gov_subsidy: {
    tag_name: "国家补贴",
    state_subsidy_info: {
      max_rebate: 15,
      min_rebate: 10,
      max_discount: "1500.00",
      min_discount: "1000.00",
      province_list: ["浙江", "上海"],
      final_promotion_target_type: "10",
    },
  },
  annual_vol: "12000",
  tk_total_sales: "12500",
  publish_info: { click_url: "https://s.click.taobao.com/test" },
};

const nestedRawItem = {
  item_id: "123456",
  item_basic_info: {
    title: rawItem.title,
    short_title: rawItem.short_title,
    brand_name: rawItem.brand_name,
    category_id: rawItem.category_id,
    category_name: rawItem.category_name,
    shop_title: rawItem.shop_title,
    seller_id: rawItem.seller_id,
    pict_url: rawItem.pict_url,
    small_images: rawItem.small_images,
    annual_vol: rawItem.annual_vol,
    tk_total_sales: rawItem.tk_total_sales,
  },
  price_promotion_info: {
    reserve_price: rawItem.reserve_price,
    zk_final_price: rawItem.zk_final_price,
    final_promotion_price: rawItem.final_promotion_price,
    promotion_tag_list: rawItem.promotion_tag_list,
    gov_subsidy: rawItem.gov_subsidy,
  },
  publish_info: rawItem.publish_info,
};

describe("TaobaoClient", () => {
  it("creates the documented uppercase MD5 signature from sorted request parameters", () => {
    expect(signTaobaoRequest({ b: "two", a: "one" }, "secret")).toBe("E542B4BD23CCB0B2B7594B5E7DF4F738");
  });

  it("formats request timestamps in China Standard Time instead of the server's UTC timezone", () => {
    expect(formatTaobaoTimestamp(new Date("2026-09-10T08:09:10.000Z"))).toBe("2026-09-10 16:09:10");
  });

  it("uses phone category 1512 and server-side adzone_id for a material search", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      tbk_dg_material_optional_upgrade_response: { result_list: { map_data: [rawItem] } },
    }));
    const client = new TaobaoClient({
      appKey: "test-app-key",
      appSecret: "test-app-secret",
      adzoneId: "test-adzone",
      fetcher,
      now: () => new Date("2026-09-10T08:09:10.000Z"),
    });

    const result = await client.searchPhoneGoods("iPhone 16 Pro", { limit: 30, page: 2, startPrice: 2500 });

    expect(result.items).toHaveLength(1);
    const [, init] = fetcher.mock.calls[0];
    const body = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(body)).toMatchObject({
      method: "taobao.tbk.dg.material.optional.upgrade",
      app_key: "test-app-key",
      adzone_id: "test-adzone",
      cat: "1512",
      q: "iPhone 16 Pro",
      page_no: "2",
      page_size: "30",
      start_price: "2500",
      sign_method: "md5",
      sign: expect.stringMatching(/^[A-F0-9]{32}$/),
    });
  });

  it("omits the phone category for a generic non-phone material search", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      tbk_dg_material_optional_upgrade_response: { result_list: { map_data: [] } },
    }));
    const client = new TaobaoClient({
      appKey: "test-app-key",
      appSecret: "test-app-secret",
      adzoneId: "test-adzone",
      fetcher,
      now: () => new Date("2026-09-10T08:09:10.000Z"),
    });

    await client.searchGoods("秋季衣服", { limit: 20, page: 1 });

    const [, init] = fetcher.mock.calls[0];
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("q")).toBe("秋季衣服");
    expect(body.has("cat")).toBe(false);
  });
});

describe("parseTaobaoMaterialResponse", () => {
  it("maps the live nested material response schema", () => {
    const result = parseTaobaoMaterialResponse({
      tbk_dg_material_optional_upgrade_response: { result_list: { map_data: [nestedRawItem] } },
    });

    expect(result.items).toEqual([expect.objectContaining({
      itemId: "123456",
      title: rawItem.title,
      shopTitle: rawItem.shop_title,
      salePrice: 7999,
      promotionTagList: ["官方立减", "地区补贴"],
      variantId: null,
    })]);
  });

  it("maps documented material fields while preserving conditional promotion pricing separately", () => {
    const result = parseTaobaoMaterialResponse({
      tbk_dg_material_optional_upgrade_response: { result_list: { map_data: [rawItem] } },
    });

    expect(result.items).toEqual([expect.objectContaining({
      itemId: "123456",
      title: "Apple iPhone 16 Pro 国行全新手机",
      shortTitle: "iPhone 16 Pro",
      brandName: "Apple",
      categoryId: "1512",
      categoryName: "手机",
      shopTitle: "Apple 授权店",
      sellerId: "789012",
      pictUrl: "https://img.example.test/iphone.jpg",
      smallImages: ["https://img.example.test/iphone-small.jpg"],
      reservePrice: 8999,
      salePrice: 7999,
      promotionPrice: 7499,
      promotionTagList: ["官方立减", "地区补贴"],
      govSubsidy: {
        tagName: "国家补贴",
        stateSubsidyInfo: {
          maxRebate: 15,
          minRebate: 10,
          maxDiscount: 1500,
          minDiscount: 1000,
          provinceList: ["浙江", "上海"],
          finalPromotionTargetType: "10",
        },
      },
      annualVol: 12000,
      totalSales: 12500,
      clickUrl: "https://s.click.taobao.com/test",
      variantId: null,
    })]);
  });
});
