type ProductImagePlaceholderProps = {
  brand: string;
  name: string;
  className?: string;
};

/**
 * A deliberate catalogue-image fallback for products without a verified image.
 * It keeps the card media frame stable now, while real product imagery can be
 * added later without changing card layouts.
 */
export function ProductImagePlaceholder({
  brand,
  name,
  className = "",
}: ProductImagePlaceholderProps) {
  return (
    <div
      aria-label={`${name} 商品图占位`}
      className={`relative isolate aspect-[4/3] overflow-hidden rounded-[1rem] border border-white/70 bg-[linear-gradient(145deg,#eff6ff_0%,#f8fafc_56%,#eef2ff_100%)] ${className}`}
      role="img"
    >
      <div aria-hidden="true" className="absolute -right-10 -top-12 size-40 rounded-full bg-blue-200/60 blur-2xl" />
      <div aria-hidden="true" className="absolute bottom-0 left-0 size-32 rounded-full bg-indigo-100/70 blur-2xl" />
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-[72%] w-[39%] -translate-x-1/2 -translate-y-1/2 rounded-[1.05rem] border-[5px] border-slate-800 bg-slate-950 shadow-[0_20px_32px_-18px_rgba(15,23,42,0.65)]">
        <div className="absolute inset-[5px] overflow-hidden rounded-[0.7rem] bg-[linear-gradient(155deg,#c7d2fe_0%,#60a5fa_45%,#1e3a8a_100%)]" />
        <div className="absolute left-2 top-2 grid grid-cols-2 gap-1.5 rounded-[0.45rem] border border-white/30 bg-slate-900/60 p-1.5 backdrop-blur">
          <span className="size-2.5 rounded-full border border-slate-500 bg-slate-800" />
          <span className="size-2.5 rounded-full border border-slate-500 bg-slate-800" />
          <span className="size-2.5 rounded-full border border-slate-500 bg-slate-800" />
          <span className="size-2.5 rounded-full border border-slate-500 bg-slate-800" />
        </div>
      </div>
      <div className="absolute bottom-3 left-3 right-3">
        <p className="truncate text-xs font-semibold text-slate-700">{brand}</p>
        <p className="mt-0.5 truncate text-sm font-bold tracking-[-0.02em] text-slate-950">{name}</p>
      </div>
    </div>
  );
}
