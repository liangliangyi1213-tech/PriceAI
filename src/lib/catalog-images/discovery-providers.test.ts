import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { phones } from "@/data/phones";
import type { PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import type { LiveTaobaoOffer } from "@/lib/platforms/taobao-client";
import {
  createPinduoduoCatalogImageDiscoveryProvider,
  createTaobaoCatalogImageDiscoveryProvider,
} from "./discovery-providers";

const product = phones.find((item) => item.slug === "xiaomi-15")!;

describe("catalog image discovery providers", () => {
  it("preserves Taobao strict match outcomes and caps returned candidates", async () => {
    const offer = { itemId: "tb-1" } as LiveTaobaoOffer;
    const searchPhoneOffersForProduct = vi.fn().mockResolvedValue([
      { offer, match: { status: "matched", product } },
      { offer: { ...offer, itemId: "tb-2" }, match: { status: "ambiguous", reason: "mixed model" } },
      { offer: { ...offer, itemId: "tb-3" }, match: { status: "unmatched", reason: "other model" } },
      { offer: { ...offer, itemId: "tb-4" }, match: { status: "matched", product } },
    ]);

    const signal = new AbortController().signal;
    const results = await createTaobaoCatalogImageDiscoveryProvider({ searchPhoneOffersForProduct }, 3).discover(product, signal);

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.match.status)).toEqual(["matched", "matched", "ambiguous"]);
    expect(searchPhoneOffersForProduct).toHaveBeenCalledWith(product, expect.objectContaining({ limit: 20 }), { signal });
  });

  it("uses the existing strict PDD selector but never promotes title-derived attributes to a Variant target", async () => {
    const listing = {
      goodsId: "pdd-1", goodsName: "小米15 12GB 256GB 黑色 国行手机",
      goodsImageUrl: "https://img.pddpic.com/xiaomi.jpg", goodsThumbnailUrl: null,
    } as PinduoduoGoods;
    const searchPhoneImageCandidatesForProduct = vi.fn().mockResolvedValue([{ listing, product }]);

    const signal = new AbortController().signal;
    const results = await createPinduoduoCatalogImageDiscoveryProvider({ searchPhoneImageCandidatesForProduct }, 3).discover(product, signal);

    expect(results[0].match).toMatchObject({ status: "matched", product, matchConfidence: 1 });
    expect(results[0].match).not.toHaveProperty("variant");
    expect(searchPhoneImageCandidatesForProduct).toHaveBeenCalledWith(product, expect.objectContaining({ limit: 3 }), { signal });
  });
});
