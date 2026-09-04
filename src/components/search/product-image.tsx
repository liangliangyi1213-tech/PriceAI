"use client";

import Image from "next/image";
import { useState } from "react";

export function ProductImage({ src, name, brand }: { src: string; name: string; brand: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = /^(\/[^/]|https:\/\/)/.test(src) && src !== "/phone-placeholder.svg" && failedSrc !== src;

  return (
    <div className="relative flex h-40 items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_25%,#ffffff_0%,#f4f3ef_60%,#eaeef4_100%)] sm:h-56">
      {usable ? (
        <Image alt={name} className="object-contain p-5 transition-transform duration-300 motion-safe:group-hover:scale-105" fill onError={() => setFailedSrc(src)} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 420px" src={src} unoptimized />
      ) : (
        <div className="relative flex h-full w-full items-center justify-center" aria-label={`${name}：商品图片待补充`}>
          <div aria-hidden="true" className="absolute bottom-8 h-5 w-40 rounded-[50%] bg-slate-400/20 blur-md" />
          <div aria-hidden="true" className="absolute bottom-6 h-6 w-52 rounded-[50%] border border-white/80 bg-white/60" />
          <div className="relative mb-3 flex h-24 w-32 -rotate-6 flex-col items-center justify-center rounded-2xl border border-white bg-white/85 shadow-[6px_12px_24px_-12px_rgba(51,65,85,0.35)] sm:h-32 sm:w-40">
            <span aria-hidden="true" className="text-5xl font-semibold tracking-tighter text-slate-700/85">{Array.from(brand.trim())[0] ?? "P"}</span>
            <span className="mt-1 max-w-full truncate px-3 text-xs font-semibold tracking-wider text-slate-500">{brand}</span>
          </div>
          <span className="absolute bottom-2 right-3 text-[10px] text-slate-500">品牌展示 · 商品图片待补充</span>
        </div>
      )}
    </div>
  );
}
