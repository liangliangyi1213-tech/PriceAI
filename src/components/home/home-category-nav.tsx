import Link from "next/link";
import {
  searchCategoryRegistry,
  type SearchCategoryId,
} from "@/lib/search/category-context";

const homepageCategoryIds: readonly SearchCategoryId[] = [
  "phones",
  "computers",
  "headphones",
  "clothing",
  "appliances",
];

export function HomeCategoryNav() {
  return (
    <nav aria-label="商品分类" className="scrollbar-none -mx-1 mt-5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
      <div className="flex min-w-max items-center gap-2 sm:min-w-0 sm:flex-wrap">
        <Link
          className="inline-flex min-h-9 items-center rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          href="#featured-heading"
        >
          推荐
        </Link>
        {homepageCategoryIds.map((categoryId) => {
          const category = searchCategoryRegistry[categoryId];
          return (
          <Link
            className="inline-flex min-h-9 items-center rounded-lg border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
            href={`/search?category=${category.id}`}
            key={category.id}
          >
            {category.label}
          </Link>
          );
        })}
        <span aria-disabled="true" className="inline-flex min-h-9 cursor-default items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-400">
          更多品类
          <span className="text-[10px]">即将支持</span>
        </span>
      </div>
    </nav>
  );
}
