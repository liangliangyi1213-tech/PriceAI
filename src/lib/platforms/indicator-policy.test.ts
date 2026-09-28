import { describe, expect, it } from "vitest";

import { canUsePlatformIndicator } from "./indicator-policy";
import type { PlatformIndicatorUsage } from "./types";

describe("platform indicator usage policy", () => {
  it.each([
    { kind: "pdd_sales_tip" as const, displayText: "已拼1.2万+", usage: "display_only" as const },
    { kind: "pdd_realtime_sales_tip" as const, displayText: "近2小时已拼100+件", usage: "display_only" as const },
    { kind: "taobao_annual_volume" as const, displayText: "1万+", period: "annual" as const, usage: "display_only" as const },
    { kind: "taobao_affiliate_promotion_30d" as const, value: 12500, period: "last_30_days" as const, usage: "display_only" as const },
  ])("allows $kind only for display", (indicator) => {
    const usages: PlatformIndicatorUsage[] = [
      "display",
      "sort",
      "filter",
      "compare",
      "score",
      "ai",
      "persist_as_sales",
    ];

    expect(usages.map((usage) => [usage, canUsePlatformIndicator(indicator, usage)]))
      .toEqual([
        ["display", true],
        ["sort", false],
        ["filter", false],
        ["compare", false],
        ["score", false],
        ["ai", false],
        ["persist_as_sales", false],
      ]);
  });
});
