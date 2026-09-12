"use client";

import { useState } from "react";

import { liveListingImageIdentity, resolveRenderableLiveImage, type LiveListingImage } from "@/lib/images/live-listing-image";

export function SafeProductImage({ image, confirmedProductName }: { image: LiveListingImage | null; confirmedProductName: string }) {
  const [failedIdentity, setFailedIdentity] = useState<string | null>(null);
  const renderableImage = resolveRenderableLiveImage(image, failedIdentity);

  return (
    <div className="relative mt-3 flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 sm:h-36" data-live-offer-image={renderableImage ? "true" : "placeholder"}>
      {renderableImage ? (
        // Provider CDN URLs are allowlisted and intentionally bypass Next image optimization in Phase 1.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={renderableImage.alt}
          className="h-full w-full object-contain p-3"
          data-external-product-id={renderableImage.externalProductId}
          data-image-platform={renderableImage.platform}
          decoding="async"
          loading="lazy"
          onError={() => setFailedIdentity(liveListingImageIdentity(renderableImage))}
          referrerPolicy="no-referrer"
          src={renderableImage.url}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-slate-400" role="img" aria-label={`${confirmedProductName}：暂无商品图`}>
          <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-400">P</span>
          <span className="text-xs">暂无商品图</span>
        </div>
      )}
    </div>
  );
}
