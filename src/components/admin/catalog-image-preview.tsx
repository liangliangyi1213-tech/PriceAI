"use client";

import { useState } from "react";

import { selectProviderImageSource, type LiveImagePlatform } from "@/lib/images/live-listing-image";

export function resolveCatalogAdminPreviewUrl(
  imagePlatform: LiveImagePlatform | null,
  imageUrl: string | null,
  failedUrl: string | null,
): string | null {
  if (!imagePlatform) return null;
  const safeUrl = selectProviderImageSource(imagePlatform, [{ kind: "admin_preview", url: imageUrl }])?.url ?? null;
  return safeUrl && safeUrl !== failedUrl ? safeUrl : null;
}

export function CatalogImagePreview({
  imageUrl,
  imagePlatform,
  productName,
  label,
}: Readonly<{
  imageUrl: string | null;
  imagePlatform: LiveImagePlatform | null;
  productName: string;
  label: string;
}>) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const renderable = resolveCatalogAdminPreviewUrl(imagePlatform, imageUrl, failedUrl);
  return (
    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" data-admin-image={renderable ? "available" : "unavailable"}>
      {renderable ? (
        // Provider URLs are allowlisted before rendering; admin previews intentionally bypass optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`${productName} · ${label}`} className="h-full w-full object-contain p-4" decoding="async" loading="lazy" onError={() => setFailedUrl(renderable)} referrerPolicy="no-referrer" src={renderable} />
      ) : <div aria-label={`${productName}：图片不可用`} className="text-sm font-medium text-slate-400" role="img">图片不可用</div>}
    </div>
  );
}
