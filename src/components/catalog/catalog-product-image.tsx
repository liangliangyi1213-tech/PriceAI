"use client";

import { useState } from "react";

import { resolveRenderableCatalogImage } from "@/lib/catalog-images/resolver";
import type { CatalogImageResolution } from "@/lib/catalog-images/types";

type CatalogProductImageProps = Readonly<{
  resolution: CatalogImageResolution;
  productName: string;
  className?: string;
  imageClassName?: string;
  eager?: boolean;
}>;

export function CatalogProductImage({
  resolution,
  productName,
  className = "aspect-[4/3]",
  imageClassName = "object-contain p-4",
  eager = false,
}: CatalogProductImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const renderable = resolveRenderableCatalogImage(resolution, failedUrl);

  return (
    <div
      className={`relative flex min-h-0 w-full items-center justify-center overflow-hidden bg-slate-50 ${className}`}
      data-catalog-image={renderable.kind === "image" ? renderable.source : "none"}
    >
      {renderable.kind === "image" ? (
        // Catalog primary URLs are validated by the server resolver and again before rendering.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={productName}
          className={`h-full w-full ${imageClassName}`}
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          onError={() => setFailedUrl(renderable.url)}
          referrerPolicy="no-referrer"
          src={renderable.url}
        />
      ) : (
        <div
          aria-label={`${productName}：暂无商品图`}
          className="flex flex-col items-center gap-2 px-3 text-center text-slate-400"
          role="img"
        >
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold">P</span>
          <span className="text-xs">暂无商品图</span>
        </div>
      )}
    </div>
  );
}
