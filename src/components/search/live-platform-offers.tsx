"use client";

import Image from "next/image";
import { useState } from "react";

import { formatPrice } from "@/lib/pricing/offers";

export type LivePlatformListing = {
  id: string;
  title: string;
  image: string | null;
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
      <li className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-blue-200" data-live-offer-card={listing.platformLabel} key={listing.id}>
        <div className={listing.image ? "grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-3" : "min-w-0"}>
          {listing.image ? (
            <div className="relative h-[4.5rem] w-[4.5rem] overflow-hidden rounded-lg bg-slate-50">
              <Image alt={listing.title} className="object-contain" fill sizes="72px" src={listing.image} unoptimized />
            </div>
          ) : null}
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">{listing.platformLabel}</span>
            <p className="mt-1.5 break-words text-sm font-medium leading-5 text-slate-800 [overflow-wrap:anywhere]">{listing.title}</p>
            {listing.merchant ? <p className="mt-0.5 break-words text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">店铺：{listing.merchant}</p> : null}
            <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="shrink-0 font-semibold tabular-nums text-orange-700">{listing.primaryPriceLabel ? `${listing.primaryPriceLabel} ` : ""}{formatPrice(listing.primaryPrice)}</span>
              {listing.metadata ? <span className="min-w-0 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{listing.metadata}</span> : null}
            </div>
            {listing.secondaryPrice !== undefined ? (
              <div className="mt-1.5 rounded-lg bg-orange-50 px-2 py-1.5 text-xs leading-5 text-orange-800">
                <span className="font-semibold">{listing.secondaryPriceLabel ?? "优惠后"} {formatPrice(listing.secondaryPrice)}</span>
                {listing.conditionNote ? <span className="ml-1">· {listing.conditionNote}</span> : null}
              </div>
            ) : null}
            {listing.tags?.length ? (
              <div aria-label="优惠信息" className="mt-1.5 flex min-w-0 flex-wrap gap-1">
                {listing.tags.map((tag) => <span className="max-w-full break-words rounded bg-orange-50 px-1.5 py-0.5 text-[11px] leading-4 text-orange-700" key={tag}>{tag}</span>)}
              </div>
            ) : null}
            {listing.href && listing.actionLabel ? (
              <a className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-orange-200 bg-white px-3 text-xs font-semibold text-orange-700 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" href={listing.href} rel="nofollow sponsored noopener noreferrer" target="_blank">
                {listing.actionLabel}<span aria-hidden="true" className="ml-1">↗</span>
              </a>
            ) : null}
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
