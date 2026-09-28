import type { PlatformIndicator, PlatformIndicatorUsage } from "./types";

function suppliedText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Provider indicators are contextual display facts, never decision or persistence facts. */
export function canUsePlatformIndicator(
  indicator: PlatformIndicator,
  usage: PlatformIndicatorUsage,
): boolean {
  return indicator.usage === "display_only" && usage === "display";
}

export function createPinduoduoIndicators(input: {
  salesTip: string | null;
  realtimeSalesTip: string | null;
}): PlatformIndicator[] {
  const realtime = suppliedText(input.realtimeSalesTip);
  const sales = suppliedText(input.salesTip);
  return [
    ...(realtime ? [{
      kind: "pdd_realtime_sales_tip" as const,
      displayText: realtime,
      usage: "display_only" as const,
    }] : []),
    ...(sales ? [{
      kind: "pdd_sales_tip" as const,
      displayText: sales,
      usage: "display_only" as const,
    }] : []),
  ];
}

export function createTaobaoIndicators(input: {
  annualVolDisplayText?: string | null;
  annualVol: number | null;
  totalSales: number | null;
}): PlatformIndicator[] {
  const annualDisplayText = suppliedText(input.annualVolDisplayText)
    ?? (input.annualVol !== null && Number.isFinite(input.annualVol) ? String(input.annualVol) : null);
  return [
    ...(annualDisplayText ? [{
      kind: "taobao_annual_volume" as const,
      displayText: annualDisplayText,
      ...(input.annualVol !== null && Number.isFinite(input.annualVol) ? { numericValue: input.annualVol } : {}),
      period: "annual" as const,
      usage: "display_only" as const,
    }] : []),
    ...(input.totalSales !== null && Number.isFinite(input.totalSales) && input.totalSales >= 0 ? [{
      kind: "taobao_affiliate_promotion_30d" as const,
      value: input.totalSales,
      period: "last_30_days" as const,
      usage: "display_only" as const,
    }] : []),
  ];
}

export function platformIndicatorDisplayLabel(indicator: PlatformIndicator): string | null {
  if (!canUsePlatformIndicator(indicator, "display")) return null;
  if (indicator.kind === "pdd_realtime_sales_tip") return `平台实时提示：${indicator.displayText}`;
  if (indicator.kind === "pdd_sales_tip") return `平台提示：${indicator.displayText}`;
  if (indicator.kind === "taobao_annual_volume") return `淘宝平台年销量指标：${indicator.displayText}`;
  return `近30天淘宝推广量：${indicator.value.toLocaleString("zh-CN")}`;
}
