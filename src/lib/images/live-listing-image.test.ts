import { describe, expect, it } from "vitest";

import {
  resolveRenderableLiveImage,
  selectLiveListingImage,
  type LiveListingImage,
} from "./live-listing-image";

const taobaoInput = {
  platform: "taobao" as const,
  externalProductId: "tb-1001",
  confirmedProductName: "小米 15",
};

describe("live listing image selection", () => {
  it("prefers the Taobao pict_url over small_images", () => {
    expect(selectLiveListingImage({
      ...taobaoInput,
      candidates: ["https://img.alicdn.com/main.jpg", "https://img.alicdn.com/small.jpg"],
    })).toEqual({
      platform: "taobao",
      externalProductId: "tb-1001",
      url: "https://img.alicdn.com/main.jpg",
      alt: "小米 15",
    });
  });

  it("uses Taobao small_images when pict_url is absent", () => {
    expect(selectLiveListingImage({
      ...taobaoInput,
      candidates: [null, "https://img.alicdn.com/small.jpg"],
    })?.url).toBe("https://img.alicdn.com/small.jpg");
  });

  it("prefers the PDD goods_image_url over goods_thumbnail_url", () => {
    expect(selectLiveListingImage({
      platform: "pinduoduo",
      externalProductId: "pdd-1001",
      confirmedProductName: "小米 15",
      candidates: ["https://img.pddpic.com/main.jpg", "https://img.pddpic.com/thumb.jpg"],
    })?.url).toBe("https://img.pddpic.com/main.jpg");
  });

  it("uses the PDD thumbnail when goods_image_url is absent", () => {
    expect(selectLiveListingImage({
      platform: "pinduoduo",
      externalProductId: "pdd-1001",
      confirmedProductName: "小米 15",
      candidates: [null, "https://img.pddpic.com/thumb.jpg"],
    })?.url).toBe("https://img.pddpic.com/thumb.jpg");
  });

  it("rejects non-HTTPS image URLs", () => {
    expect(selectLiveListingImage({
      ...taobaoInput,
      candidates: ["http://img.alicdn.com/main.jpg"],
    })).toBeNull();
  });

  it("rejects hosts outside the platform allowlist", () => {
    expect(selectLiveListingImage({
      ...taobaoInput,
      candidates: ["https://images.example.com/main.jpg"],
    })).toBeNull();
  });

  it("drops a failed image identity instead of retrying it", () => {
    const image: LiveListingImage = {
      platform: "taobao",
      externalProductId: "tb-1001",
      url: "https://img.alicdn.com/main.jpg",
      alt: "小米 15",
    };
    expect(resolveRenderableLiveImage(image, "taobao:tb-1001:https://img.alicdn.com/main.jpg")).toBeNull();
  });
});
