export function ResultsSearch({ query, compareSlugs }: { query?: string; compareSlugs: string[] }) {
  return (
    <div className="sticky top-16 z-20 border-b border-slate-200 bg-white/95 backdrop-blur sm:top-[4.5rem]">
      <div className="page-shell py-2">
        <form action="/search" className="flex w-full items-center gap-2 rounded-2xl border border-blue-200 bg-white p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/30" method="get" role="search">
          <svg aria-hidden="true" className="ml-2 hidden size-5 shrink-0 text-blue-500 sm:block" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <label className="sr-only" htmlFor="results-query">搜索商品</label>
          <input className="h-11 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-base text-slate-950 outline-none placeholder:text-slate-400" defaultValue={query} id="results-query" key={query ?? ""} name="q" placeholder="搜索你想买的商品" type="search" />
          {compareSlugs.map((slug) => <input key={slug} name="compare" type="hidden" value={slug} />)}
          <button className="min-h-11 shrink-0 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:px-8" type="submit">搜索比价</button>
        </form>
      </div>
    </div>
  );
}
