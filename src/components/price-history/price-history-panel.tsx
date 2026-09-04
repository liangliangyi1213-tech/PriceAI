import { PriceHistoryChart } from "./price-history-chart";

import type { PriceHistoryViewModel } from "@/lib/price-history/types";

function formatPrice(price: number | null): string {
  return price === null ? "暂无数据" : `¥${price.toLocaleString("zh-CN")}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "暂无数据" : `${value}%`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs font-medium text-slate-600">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

export function PriceHistoryPanel({ view }: { view: PriceHistoryViewModel }) {
  const { stats } = view;

  return (
    <section aria-labelledby="price-history-heading" className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-blue-700">PriceAI 价格数据</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950" id="price-history-heading">历史价格</h2>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">{view.judgment.label}</span>
      </div>

      {!stats.sampleCount ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center">
          <p className="font-medium text-slate-950">暂无足够的历史价格数据</p>
          <p className="mt-2 text-sm text-slate-600">积累更多价格记录后，就能查看价格变化。</p>
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="当前价格" value={formatPrice(stats.currentPrice)} />
            <StatCard label="历史最低价" value={formatPrice(stats.historicalLow)} />
            <StatCard label="历史最高价" value={formatPrice(stats.historicalHigh)} />
            <StatCard label="历史平均价" value={formatPrice(stats.averagePrice)} />
            <StatCard label="距历史低价" value={formatPercent(stats.currentPriceDistanceFromLowPercent)} />
            <StatCard label="价格记录" value={`${stats.sampleCount} 条`} />
          </dl>
          <p className="mt-5 rounded-xl bg-blue-50/70 p-4 text-sm leading-6 text-slate-700">{view.summary}</p>
          {view.points.length >= 2 && <div className="mt-6 overflow-x-auto"><PriceHistoryChart points={view.points} /></div>}
        </>
      )}
    </section>
  );
}
