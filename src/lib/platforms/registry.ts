import "server-only";

import { phones } from "@/data/phones";

import { JdPlatformAdapter, TaobaoPlatformAdapter, UnsupportedPlatformAdapter } from "./unsupported-platform-adapter";
import { MockPlatformAdapter } from "./mock-platform-adapter";
import type { PlatformAdapter, PlatformAdapterId } from "./types";

const platformAdapters: Record<PlatformAdapterId, PlatformAdapter> = {
  mock: new MockPlatformAdapter(phones),
  jd: new JdPlatformAdapter(),
  taobao: new TaobaoPlatformAdapter(),
  pdd: new UnsupportedPlatformAdapter("pdd"),
};

/** Resolves integrations centrally so business code never constructs platform adapters itself. */
export function getPlatformAdapter(id: PlatformAdapterId): PlatformAdapter {
  return platformAdapters[id];
}
