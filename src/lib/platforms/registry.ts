import "server-only";

import { phones } from "@/data/phones";

import { JdPlatformAdapter, TaobaoPlatformAdapter } from "./unsupported-platform-adapter";
import { MockPlatformAdapter } from "./mock-platform-adapter";
import { PinduoduoAdapter } from "./pinduoduo-adapter";
import { createPinduoduoClientFromEnv } from "./pinduoduo-client";
import type { PlatformAdapter, PlatformAdapterId, PlatformSearchOptions, PlatformSearchResult } from "./types";

const mockAdapter = new MockPlatformAdapter(phones);

async function getPinduoduoFixtureRecommendations(options: PlatformSearchOptions = {}): Promise<PlatformSearchResult[]> {
  const batches = await Promise.all(phones.map((product) => mockAdapter.searchProducts(product.name, { limit: 400 })));
  let results = batches.flat().filter((result) => result.platform === "pdd");
  if (options.minPrice !== undefined) results = results.filter((result) => result.price >= options.minPrice!);
  if (options.maxPrice !== undefined) results = results.filter((result) => result.price <= options.maxPrice!);
  if (options.sort === "price_asc") results.sort((left, right) => left.price - right.price);
  if (options.sort === "price_desc") results.sort((left, right) => right.price - left.price);
  const limit = typeof options.limit === "number" && Number.isFinite(options.limit) ? Math.max(1, Math.floor(options.limit)) : 20;
  const page = typeof options.page === "number" && Number.isFinite(options.page) ? Math.max(1, Math.floor(options.page)) : 1;
  return results.slice((page - 1) * limit, page * limit);
}

const platformAdapters: Record<PlatformAdapterId, PlatformAdapter> = {
  mock: mockAdapter,
  jd: new JdPlatformAdapter(),
  taobao: new TaobaoPlatformAdapter(),
  pdd: new PinduoduoAdapter({
    client: createPinduoduoClientFromEnv(),
    fallback: { getRecommendedProducts: getPinduoduoFixtureRecommendations },
    isDevelopment: process.env.NODE_ENV !== "production",
  }),
};

/** Resolves integrations centrally so business code never constructs platform adapters itself. */
export function getPlatformAdapter(id: PlatformAdapterId): PlatformAdapter {
  return platformAdapters[id];
}
