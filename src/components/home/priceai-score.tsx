type PriceAIScoreProps = {
  score: number | null;
  size?: "compact" | "standard" | "prominent";
  showLabel?: boolean;
};

function getScoreLabel(score: number | null): string {
  if (score === null) return "待评估";
  if (score >= 90) return "很值得买";
  if (score >= 80) return "比较值得买";
  if (score >= 70) return "可以关注";
  if (score >= 60) return "表现一般";
  return "谨慎考虑";
}

/** A category-agnostic presentation of the existing deterministic value score. */
export function PriceAIScore({ score, size = "standard", showLabel = true }: PriceAIScoreProps) {
  const displayScore = score !== null && Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
  const label = getScoreLabel(displayScore);
  const isCompact = size === "compact";

  if (size === "prominent") {
    return (
      <div aria-label={`PriceAI 评分：${displayScore ?? "暂无数据"}，${label}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-blue-50/70 px-3 py-2.5">
        <span className="text-xs font-semibold text-blue-900">Price<span className="text-blue-600">AI</span> 评分</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold leading-none tracking-tight text-blue-700">{displayScore ?? "—"}</span>
          <span className="text-xs text-slate-500">/ 100</span>
          {showLabel ? <span className={`ml-2 text-xs font-semibold ${displayScore !== null && displayScore >= 80 ? "text-emerald-700" : displayScore !== null && displayScore < 60 ? "text-amber-800" : "text-slate-600"}`}>{label}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label={`PriceAI 评分：${displayScore ?? "暂无数据"}，${label}`}
      className={`inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-[linear-gradient(135deg,#eff6ff_0%,#eef2ff_100%)] text-blue-950 ${isCompact ? "px-2 py-1.5" : "px-2.5 py-2"}`}
    >
      <span className="whitespace-nowrap text-[10px] font-bold text-blue-700">PriceAI 评分</span>
      <span className={`font-bold tracking-[-0.04em] text-blue-700 ${isCompact ? "text-lg" : "text-xl"}`}>{displayScore ?? "—"}</span>
      {showLabel ? <span className="border-l border-blue-200 pl-2 text-xs font-semibold text-blue-800">{label}</span> : null}
    </div>
  );
}
