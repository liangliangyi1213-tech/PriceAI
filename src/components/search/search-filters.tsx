import Link from "next/link";

import type { ProductSearchQuery } from "@/lib/search/query";
import type { SearchFacetCapabilities } from "@/lib/search/category-context";
import { searchHref } from "./presentation";

type SearchFiltersProps = {
  brands: string[];
  searchQuery: ProductSearchQuery;
  compareSlugs?: string[];
  facets: SearchFacetCapabilities;
};

function isSelectedBrand(brand: string, selectedBrands: string[] | undefined): boolean {
  return selectedBrands?.some((selected) => selected.toLowerCase() === brand.toLowerCase()) ?? false;
}

function FilterFields({ brands, searchQuery, facets }: SearchFiltersProps) {
  return (
    <>
      {facets.brands && brands.length ? <fieldset>
        <legend className="text-sm font-semibold text-slate-900">品牌</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {brands.map((brand) => (
            <label className="flex min-h-9 items-center gap-2 text-sm text-slate-700" key={brand}>
              <input className="size-4 accent-blue-600" defaultChecked={isSelectedBrand(brand, searchQuery.brands)} name="brand" type="checkbox" value={brand} />
              {brand}
            </label>
          ))}
        </div>
      </fieldset> : null}

      {facets.price ? <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-slate-700">
          最低价格
          <input className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={searchQuery.minPrice} inputMode="decimal" min="0" step="any" name="minPrice" placeholder="¥ 不限" type="number" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          最高价格
          <input className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={searchQuery.maxPrice} inputMode="decimal" min="0" step="any" name="maxPrice" placeholder="¥ 不限" type="number" />
        </label>
      </div> : null}

      {facets.score ? <label className="block text-sm font-medium text-slate-700">
        最低性价比分数
        <input className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={searchQuery.minScore} inputMode="numeric" max="100" min="0" name="minScore" placeholder="不限" type="number" />
      </label> : null}

      {facets.score ? <p className="text-xs leading-5 text-slate-500">PriceAI 评分满分 100 分，仅供选购参考。暂无报价的商品不显示评分。</p> : null}
    </>
  );
}

function FilterForm({ brands, searchQuery, compareSlugs, facets }: SearchFiltersProps) {
  return (
    <form action="/search" className="space-y-5" method="get">
      {searchQuery.query && <input name="q" type="hidden" value={searchQuery.query} />}
      {searchQuery.category && <input name="category" type="hidden" value={searchQuery.category} />}
      <input name="sort" type="hidden" value={searchQuery.sort} />
      {compareSlugs?.map((slug) => <input key={slug} name="compare" type="hidden" value={slug} />)}
      <FilterFields brands={brands} facets={facets} searchQuery={searchQuery} />
      <div className="flex gap-3">
        <button className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" type="submit">应用筛选</button>
        <Link className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100" href={searchHref({ query: searchQuery.query, category: searchQuery.category, sort: "relevance" }, compareSlugs)}>清除筛选</Link>
      </div>
    </form>
  );
}

export function SearchFilters(props: SearchFiltersProps) {
  const { facets } = props;
  if (!Object.values(facets).some(Boolean)) return null;
  const summary = [facets.brands ? "品牌" : null, facets.price ? "价格" : null, facets.score ? "评分" : null].filter(Boolean).join(" / ");
  return (
    <aside aria-label="商品筛选" className="min-w-0 self-start lg:sticky lg:top-40">
      <div className="hidden rounded-2xl border border-slate-200 bg-white p-4 lg:block">
        <h2 className="text-base font-semibold text-slate-950">缩小选择范围</h2>
        <div className="mt-5"><FilterForm {...props} /></div>
      </div>
      <details className="rounded-xl border border-slate-200 bg-white px-3 lg:hidden">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-slate-700">筛选 · {summary}</summary>
        <div className="mt-5"><FilterForm {...props} /></div>
      </details>
    </aside>
  );
}
