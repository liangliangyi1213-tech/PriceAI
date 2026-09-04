"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { parseCompareQuery } from "@/lib/compare/query";
import { toggleCompareSelection } from "@/lib/compare/selection";

type CompareProductOption = {
  slug: string;
  name: string;
};

function getSelectedSlugs(searchParams: ReturnType<typeof useSearchParams>, options: CompareProductOption[]): string[] {
  const availableSlugs = new Set(options.map((option) => option.slug));
  return parseCompareQuery(searchParams.getAll("compare")).filter((slug) => availableSlugs.has(slug));
}

function replaceCompareSelection(
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
  selectedSlugs: string[],
  replace: ReturnType<typeof useRouter>["replace"],
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("compare");
  if (selectedSlugs.length) nextParams.set("compare", selectedSlugs.join(","));
  const nextQuery = nextParams.toString();

  replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
}

export function CompareToggleButton({ productSlug, productOptions }: { productSlug: string; productOptions: CompareProductOption[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notice, setNotice] = useState("");
  const selectedSlugs = getSelectedSlugs(searchParams, productOptions);
  const isSelected = selectedSlugs.includes(productSlug);

  function toggle() {
    const result = toggleCompareSelection(selectedSlugs, productSlug);
    if (result.status === "limit_reached") {
      setNotice("最多可同时对比 4 款商品");
      return;
    }

    setNotice("");
    replaceCompareSelection(pathname, searchParams, result.selectedSlugs, router.replace);
  }

  return (
    <div className="mt-3">
      <button
        aria-pressed={isSelected}
        className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${isSelected ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-700 hover:border-blue-400 hover:bg-blue-50"}`}
        onClick={toggle}
        type="button"
      >
        {isSelected ? "已加入对比" : "加入对比"}
      </button>
      {notice && <p aria-live="polite" className="mt-2 text-sm font-medium text-amber-700">{notice}</p>}
    </div>
  );
}

export function CompareBar({ productOptions }: { productOptions: CompareProductOption[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSlugs = getSelectedSlugs(searchParams, productOptions);
  const selectedProducts = selectedSlugs.map((slug) => productOptions.find((product) => product.slug === slug)).filter((product): product is CompareProductOption => product !== undefined);

  function updateSelection(nextSlugs: string[]) {
    replaceCompareSelection(pathname, searchParams, nextSlugs, router.replace);
  }

  if (!selectedProducts.length) return null;

  const compareHref = `/compare?products=${encodeURIComponent(selectedSlugs.join(","))}`;

  return (
    <section aria-label="商品对比栏" className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-5">
      <div>
        <p className="font-semibold text-slate-950">已选择 {selectedProducts.length}/4 款商品</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedProducts.map((product) => (
            <button className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-blue-100 hover:bg-slate-50" key={product.slug} onClick={() => updateSelection(selectedSlugs.filter((slug) => slug !== product.slug))} type="button">
              {product.name} <span aria-hidden="true">×</span><span className="sr-only">移除 {product.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex gap-3 sm:mt-0 sm:shrink-0">
        <button className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-white/70" onClick={() => updateSelection([])} type="button">清空</button>
        {selectedProducts.length >= 2 ? (
          <Link className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" href={compareHref}>开始对比</Link>
        ) : (
          <button aria-disabled="true" className="min-h-11 cursor-not-allowed rounded-lg bg-slate-200 px-4 text-sm font-semibold text-slate-500" disabled type="button">开始对比</button>
        )}
      </div>
    </section>
  );
}
