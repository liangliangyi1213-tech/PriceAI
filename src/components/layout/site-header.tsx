"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "首页" },
  { href: "/rankings", label: "榜单" },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="page-shell flex h-16 items-center justify-between gap-2 sm:h-[4.5rem]">
        <Link aria-label="PriceAI 首页" className="shrink-0 text-lg font-bold tracking-[-0.04em] text-slate-950 sm:text-xl" href="/">
          Price<span className="text-blue-600">AI</span>
        </Link>
        <nav aria-label="主导航" className="flex items-center gap-0.5 sm:gap-1">
          {navigation.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-2.5 py-2 text-sm font-medium transition-colors sm:px-3 ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:px-4" href="/#compare-search">
          开始比价
        </Link>
      </div>
    </header>
  );
}
