"use client";

import { useState } from "react";

type DiscoveryImageProps = {
  image: string | null;
  title: string;
};

export function DiscoveryImage({ image, title }: DiscoveryImageProps) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const hasUsableImage = Boolean(
    image
    && image !== "/phone-placeholder.svg"
    && /^(\/[^/]|https:\/\/)/.test(image)
    && failedImage !== image,
  );

  if (!hasUsableImage || !image) return null;

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-slate-50">
      {/* Catalog imagery may use several verified providers, so this boundary
          intentionally handles failures without depending on a fixed host list. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={title}
        className="h-full w-full object-contain p-3"
        loading="lazy"
        onError={() => setFailedImage(image)}
        referrerPolicy="no-referrer"
        src={image}
      />
    </div>
  );
}
