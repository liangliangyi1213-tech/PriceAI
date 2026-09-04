import Link from "next/link";
import type { ProductSearchQuery, ProductSearchSort } from "@/lib/search/query";
import { searchHref } from "./presentation";

const sorts: { value: ProductSearchSort; label: string }[] = [
  { value: "relevance", label: "综合相关" },
  { value: "price_asc", label: "价格 ↑" },
  { value: "price_desc", label: "价格 ↓" },
  { value: "score_desc", label: "性价比分" },
  { value: "rating_desc", label: "评分优先" },
  { value: "sales_desc", label: "销量优先" },
];

export function ResultsToolbar({ count, query, compareSlugs }: { count: number; query: ProductSearchQuery; compareSlugs: string[] }) {
  const filters = (query.brands ?? []).map((brand) => ({ label: `品牌 ${brand}`, href: searchHref(query, compareSlugs, { brands: query.brands?.filter((item) => item !== brand) }) }));
  if (query.minPrice !== undefined) filters.push({ label: `最低 ¥${query.minPrice}`, href: searchHref(query, compareSlugs, { minPrice: undefined }) });
  if (query.maxPrice !== undefined) filters.push({ label: `最高 ¥${query.maxPrice}`, href: searchHref(query, compareSlugs, { maxPrice: undefined }) });
  if (query.minScore !== undefined) filters.push({ label: `性价比 ≥ ${query.minScore}`, href: searchHref(query, compareSlugs, { minScore: undefined }) });

  return (
    <div className="mb-3">
      <h2 className="sr-only">商品结果 {count} 款</h2>
      <nav aria-label="商品排序" className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 sm:flex sm:flex-wrap">
        {sorts.map(({ value, label }) => <Link aria-current={query.sort === value ? "true" : undefined} aria-label={value === "price_asc" ? "价格从低到高" : value === "price_desc" ? "价格从高到低" : label} className={`inline-flex min-h-11 min-w-0 items-center justify-center whitespace-nowrap rounded-lg px-2 text-sm font-medium transition-colors sm:px-3 ${query.sort === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`} href={searchHref(query, compareSlugs, { sort: value })} key={value}>{label}</Link>)}
      </nav>
      {filters.length ? <div aria-label="已选筛选" className="mt-3 flex flex-wrap items-center gap-2">{filters.map((filter) => <Link aria-label={`移除${filter.label}`} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 text-xs text-blue-800" href={filter.href} key={filter.label}>{filter.label}<span aria-hidden="true">×</span></Link>)}</div> : null}
    </div>
  );
}
