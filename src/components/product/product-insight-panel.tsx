import type { ProductInsight } from "@/lib/ai/types";

function InsightList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-3 text-[15px] leading-7 text-slate-700">
      {items.map((item) => (
        <li className="flex gap-2.5" key={item}>
          <span
            aria-hidden="true"
            className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function InsightGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-white/65 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <InsightList items={items} />
    </div>
  );
}

export function ProductInsightPanel({ insight }: { insight: ProductInsight }) {
  return (
    <section
      aria-labelledby="insight-heading"
      className="mt-8 rounded-2xl border border-violet-100 bg-violet-50/40 p-5 sm:p-8"
    >
      <p className="text-sm font-semibold text-violet-700">PriceAI</p>
      <h2 className="mt-1 text-2xl font-bold text-slate-950" id="insight-heading">
        AI 购买建议
      </h2>

      <div className="mt-5 rounded-2xl border border-violet-100 bg-white/90 p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-violet-700">一句话购买结论</h3>
        <p className="mt-2 text-lg font-semibold leading-8 text-slate-950 sm:text-xl">
          {insight.verdict}
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <InsightGroup items={insight.pros} title="主要优点" />
        <InsightGroup items={insight.cons} title="需要注意" />
        <InsightGroup items={insight.suitableFor} title="适合谁" />
        <InsightGroup items={insight.notSuitableFor} title="不太适合谁" />
      </div>

      <div className="mt-5 rounded-xl border border-violet-100 bg-white/75 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-slate-950">购买建议</h3>
        <p className="mt-2 text-[15px] leading-7 text-slate-700">{insight.buyingAdvice}</p>
      </div>
    </section>
  );
}
