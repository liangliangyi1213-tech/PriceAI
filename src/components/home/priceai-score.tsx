type PriceAIScoreProps = {
  score: number | null;
  size?: "compact" | "standard";
  showLabel?: boolean;
};

function getScoreLabel(score: number | null): string {
  if (score === null) return "待评估";
  if (score >= 80) return "值得买";
  if (score >= 70) return "值得关注";
  return "多做比较";
}

/** A category-agnostic presentation of the existing deterministic value score. */
export function PriceAIScore({ score, size = "standard", showLabel = true }: PriceAIScoreProps) {
  const isCompact = size === "compact";

  return (
    <div
      aria-label={`PriceAI 评分：${score ?? "暂无数据"}，${getScoreLabel(score)}`}
      className={`inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-[linear-gradient(135deg,#eff6ff_0%,#eef2ff_100%)] text-blue-950 ${isCompact ? "px-2 py-1.5" : "px-2.5 py-2"}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700">PriceAI</span>
      <span className={`font-bold tracking-[-0.04em] text-blue-700 ${isCompact ? "text-lg" : "text-xl"}`}>{score ?? "—"}</span>
      {showLabel ? <span className="border-l border-blue-200 pl-2 text-xs font-semibold text-blue-800">{getScoreLabel(score)}</span> : null}
    </div>
  );
}
