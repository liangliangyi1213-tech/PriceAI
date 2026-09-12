"use client";

import { useState } from "react";

import type { LiveListingImage } from "@/lib/images/live-listing-image";
import { formatPrice } from "@/lib/pricing/offers";

import { SafeProductImage } from "./safe-product-image";

export type LivePlatformListing = {
  id: string;
  title: string;
  image: LiveListingImage | null;
  merchant: string | null;
  primaryPrice: number;
  primaryPriceLabel?: string;
  secondaryPrice?: number;
  secondaryPriceLabel?: string;
  conditionNote?: string;
  tags?: readonly string[];
  metadata?: string | null;
  href?: string | null;
  actionLabel?: string;
  platformLabel: string;
  confirmedProductName: string;
};

export function LivePlatformOffers({
  ariaLabel,
  title,
  notice,
  listings,
  defaultVisibleCount,
  expandLabel,
  collapseLabel,
}: {
  ariaLabel: string;
  title: string;
  notice: string;
  listings: readonly LivePlatformListing[];
  defaultVisibleCount?: number;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!listings.length) return null;
  const visibleCount = Math.max(0, defaultVisibleCount ?? listings.length);
  const remainingCount = Math.max(0, listings.length - visibleCount);
  const visibleListings = expanded ? listings : listings.slice(0, visibleCount);

  function cards(items: readonly LivePlatformListing[]) {
    return items.map((listing) => (
      <li className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md" data-live-offer-card={listing.platformLabel} key={listing.id}>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700" data-platform-badge={listing.platformLabel}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-blue-500" />{listing.platformLabel}
        </span>

        <SafeProductImage confirmedProductName={listing.confirmedProductName} image={listing.image} />

        <div className="flex min-w-0 flex-1 flex-col pt-3" data-live-offer-body="true">
          <p className="line-clamp-3 min-h-[3.75rem] break-words text-sm font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]" title={listing.title}>{listing.title}</p>
          <p className="mt-1 min-h-5 truncate text-xs leading-5 text-slate-400" title={listing.merchant ?? undefined}>{listing.merchant ? `店铺：${listing.merchant}` : "店铺信息暂缺"}</p>

          <div aria-label={`${listing.primaryPriceLabel ?? "当前价格"} ${formatPrice(listing.primaryPrice)}`} className="mt-3 min-w-0">
            <p className="text-[11px] font-medium text-slate-500">{listing.primaryPriceLabel ?? "当前价格"}</p>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="shrink-0 text-xl font-bold tabular-nums tracking-tight text-blue-700">{formatPrice(listing.primaryPrice)}</span>
              {listing.metadata ? <span className="min-w-0 truncate text-xs text-slate-500">{listing.metadata}</span> : null}
            </div>
          </div>

          {listing.secondaryPrice !== undefined ? (
            <div className="mt-2 rounded-lg border border-orange-100 bg-orange-50/75 px-2.5 py-2 text-xs leading-5 text-orange-900">
              <span className="font-bold">{listing.secondaryPriceLabel ?? "条件优惠价"} {formatPrice(listing.secondaryPrice)}</span>
              {listing.conditionNote ? <span className="mt-0.5 block text-[11px] leading-4 text-orange-700">{listing.conditionNote}</span> : null}
            </div>
          ) : null}

          {listing.tags?.length ? (
            <div aria-label="优惠信息" className="mt-2 flex min-h-5 min-w-0 gap-1 overflow-hidden">
              {listing.tags.slice(0, 3).map((tag) => <span className="max-w-[7rem] shrink-0 truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] leading-4 text-slate-600" key={tag} title={tag}>{tag}</span>)}
            </div>
          ) : null}

          <div className="mt-auto pt-4" data-live-offer-action="true">
            {listing.href && listing.actionLabel ? (
              <a className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" href={listing.href} rel="nofollow sponsored noopener noreferrer" target="_blank">
                {listing.actionLabel}<span aria-hidden="true" className="ml-1">↗</span>
              </a>
            ) : (
              <span aria-disabled="true" className="inline-flex min-h-10 w-full cursor-not-allowed items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400">暂无可用跳转</span>
            )}
          </div>
        </div>
      </li>
    ));
  }

  return (
    <section aria-label={ariaLabel} className="min-w-0">
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      <p className="mt-1 text-xs leading-5 text-amber-700">{notice}</p>
      <ul className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards(visibleListings)}</ul>
      {remainingCount ? (
        <button
          aria-expanded={expanded}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? collapseLabel ?? "收起报价" : expandLabel ?? `查看其余 ${remainingCount} 条报价`}
        </button>
      ) : null}
    </section>
  );
}
