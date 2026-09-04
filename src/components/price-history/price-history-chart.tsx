"use client";

import { useState } from "react";

import type { PriceHistoryChartPoint } from "@/lib/price-history/types";

const chartWidth = 720;
const chartHeight = 280;
const padding = { top: 24, right: 24, bottom: 42, left: 62 };

function formatPrice(price: number): string {
  return `¥${price.toLocaleString("zh-CN")}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

export function PriceHistoryChart({ points }: { points: PriceHistoryChartPoint[] }) {
  const [activePointId, setActivePointId] = useState<string | null>(points.at(-1)?.id ?? null);
  if (points.length < 2) return null;

  const prices = points.map((point) => point.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const range = high - low;
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const coordinates = points.map((point, index) => ({
    point,
    x: padding.left + (plotWidth * index) / (points.length - 1),
    y: range === 0 ? padding.top + plotHeight / 2 : padding.top + ((high - point.price) / range) * plotHeight,
  }));
  const activePoint = points.find((point) => point.id === activePointId) ?? points.at(-1)!;
  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  const path = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <div className="mt-6">
      <div className="min-w-[34rem]">
        <svg aria-label="近 30 天价格趋势图" className="h-auto w-full" role="img" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <line stroke="#cbd5e1" strokeWidth="1" x1={padding.left} x2={chartWidth - padding.right} y1={padding.top} y2={padding.top} />
          <line stroke="#cbd5e1" strokeWidth="1" x1={padding.left} x2={chartWidth - padding.right} y1={padding.top + plotHeight} y2={padding.top + plotHeight} />
          <text fill="#64748b" fontSize="12" textAnchor="end" x={padding.left - 10} y={padding.top + 4}>{formatPrice(high)}</text>
          <text fill="#64748b" fontSize="12" textAnchor="end" x={padding.left - 10} y={padding.top + plotHeight + 4}>{formatPrice(low)}</text>
          <polyline fill="none" points={path} stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {coordinates.map(({ point, x, y }, index) => {
            const fill = point.isCurrent && point.isHistoricalLow ? "#7c3aed" : point.isHistoricalLow ? "#059669" : point.isCurrent ? "#2563eb" : "#ffffff";
            const stroke = point.isHistoricalLow || point.isCurrent ? fill : "#2563eb";

            return (
              <g key={point.id}>
                <circle
                  aria-label={`${formatFullDate(point.recordedAt)}，${point.platform}，${formatPrice(point.price)}`}
                  cx={x}
                  cy={y}
                  fill={fill}
                  onFocus={() => setActivePointId(point.id)}
                  onMouseEnter={() => setActivePointId(point.id)}
                  r={point.isCurrent || point.isHistoricalLow ? 6 : 4}
                  role="button"
                  stroke={stroke}
                  strokeWidth="2"
                  tabIndex={0}
                >
                  <title>{`${formatFullDate(point.recordedAt)} · ${point.platform} · ${formatPrice(point.price)}`}</title>
                </circle>
                {labelIndexes.has(index) && <text fill="#64748b" fontSize="12" textAnchor="middle" x={x} y={chartHeight - 16}>{formatDate(point.recordedAt)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div aria-live="polite" className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        <span className="font-semibold text-slate-950">{formatFullDate(activePoint.recordedAt)}</span>
        <span> · {activePoint.platform} · {formatPrice(activePoint.price)}</span>
        {activePoint.originalPrice !== null && <span> · 原价 {formatPrice(activePoint.originalPrice)}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span><span aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />当前价格点</span>
        <span><span aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />历史最低价点</span>
      </div>
    </div>
  );
}
