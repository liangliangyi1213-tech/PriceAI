import Link from "next/link";

import type { ProductSearchQuery, ProductSearchSort } from "@/lib/search/query";

const sortOptions: Array<{ value: ProductSearchSort; label: string }> = [
  { value: "relevance", label: "相关性" },
  { value: "price_asc", label: "价格从低到高" },
  { value: "price_desc", label: "价格从高到低" },
  { value: "score_desc", label: "性价比最高" },
  { value: "rating_desc", label: "评分最高" },
  { value: "sales_desc", label: "销量最高" },
];

type SearchFiltersProps = {
  brands: string[];
  searchQuery: ProductSearchQuery;
  compareSlugs?: string[];
};

function isSelectedBrand(brand: string, selectedBrands: string[] | undefined): boolean {
  return selectedBrands?.some((selected) => selected.toLowerCase() === brand.toLowerCase()) ?? false;
}

function FilterFields({ brands, searchQuery }: SearchFiltersProps) {
  return (
    <>
      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">品牌</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {brands.map((brand) => (
            <label className="flex min-h-9 items-center gap-2 text-sm text-slate-700" key={brand}>
              <input defaultChecked={isSelectedBrand(brand, searchQuery.brands)} name="brand" type="checkbox" value={brand} />
              {brand}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-slate-700">
          最低价格
          <input className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={searchQuery.minPrice} inputMode="decimal" min="0" name="minPrice" placeholder="不限" type="number" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          最高价格
          <input className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={searchQuery.maxPrice} inputMode="decimal" min="0" name="maxPrice" placeholder="不限" type="number" />
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        最低性价比分数
        <input className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={searchQuery.minScore} inputMode="numeric" max="100" min="0" name="minScore" placeholder="不限" type="number" />
      </label>

      <label className="block text-sm font-medium text-slate-700">
        排序
        <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" defaultValue={searchQuery.sort} name="sort">
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </>
  );
}

function FilterForm({ brands, searchQuery, compareSlugs }: SearchFiltersProps) {
  return (
    <form action="/search" className="space-y-5" method="get">
      {searchQuery.query && <input name="q" type="hidden" value={searchQuery.query} />}
      {compareSlugs?.map((slug) => <input key={slug} name="compare" type="hidden" value={slug} />)}
      <FilterFields brands={brands} searchQuery={searchQuery} />
      <div className="flex gap-3">
        <button className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" type="submit">应用筛选</button>
        <Link className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100" href="/search">清除筛选</Link>
      </div>
    </form>
  );
}

export function SearchFilters(props: SearchFiltersProps) {
  return (
    <aside aria-label="商品筛选" className="mt-6">
      <div className="hidden rounded-2xl border border-slate-200 bg-white p-5 md:block">
        <h2 className="text-base font-semibold text-slate-950">筛选和排序</h2>
        <div className="mt-5"><FilterForm {...props} /></div>
      </div>
      <details className="rounded-2xl border border-slate-200 bg-white p-4 md:hidden">
        <summary className="cursor-pointer list-none font-semibold text-slate-950">筛选和排序</summary>
        <div className="mt-5"><FilterForm {...props} /></div>
      </details>
    </aside>
  );
}
