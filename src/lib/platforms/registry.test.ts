import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getPlatformAdapter } from "./registry";

describe("platform adapter registry", () => {
  it("returns the registered mock adapter", () => {
    expect(getPlatformAdapter("mock").id).toBe("mock");
  });

  it("returns a real-platform stub that never fabricates search results", async () => {
    const adapter = getPlatformAdapter("jd");

    await expect(adapter.searchProducts("iPhone")).rejects.toMatchObject({
      name: "PlatformUnavailableError",
      platform: "jd",
    });
  });

  it("registers Pinduoduo as a recommendation product-pool adapter", () => {
    const adapter = getPlatformAdapter("pdd");

    expect(adapter.id).toBe("pdd");
    expect(adapter.getRecommendedProducts).toBeTypeOf("function");
  });
});
