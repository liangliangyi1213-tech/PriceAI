import Link from "next/link";

type HomeCategory = {
  label: string;
  href?: string;
};

// Kept as a display configuration so future category data can replace it
// without changing the navigation component's shape.
const categories: HomeCategory[] = [
  { label: "推荐", href: "#featured-heading" },
  { label: "数码", href: "/search" },
  { label: "服饰" },
  { label: "美妆" },
  { label: "家居" },
  { label: "日用" },
  { label: "食品" },
  { label: "运动" },
  { label: "更多" },
];

export function HomeCategoryNav() {
  return (
    <nav aria-label="商品分类" className="scrollbar-none -mx-1 mt-5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
      <div className="flex min-w-max items-center gap-2 sm:min-w-0 sm:flex-wrap">
        {categories.map((category) => category.href ? (
          <Link
            className={`inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold transition-colors ${category.label === "推荐" ? "bg-slate-950 text-white hover:bg-slate-800" : "border border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
            href={category.href}
            key={category.label}
          >
            {category.label}
          </Link>
        ) : (
          <span aria-disabled="true" className="inline-flex min-h-9 cursor-default items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-400" key={category.label}>
            {category.label}
          </span>
        ))}
        <span className="pl-1 text-xs font-medium text-slate-400">更多品类陆续接入</span>
      </div>
    </nav>
  );
}
