import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriceAIScore } from "./priceai-score";

describe("PriceAI score grades", () => {
  it.each([
    [100, "很值得买"], [90, "很值得买"], [89, "比较值得买"], [80, "比较值得买"],
    [79, "可以关注"], [70, "可以关注"], [69, "表现一般"], [60, "表现一般"],
    [59, "谨慎考虑"], [0, "谨慎考虑"], [null, "待评估"],
    [Number.NaN, "待评估"], [Infinity, "待评估"], [-1, "待评估"], [101, "待评估"],
  ])("renders %s as %s without changing the numeric score", (score, grade) => {
    const html = renderToStaticMarkup(<PriceAIScore score={score} />);
    expect(html).toContain(grade);
    if (score !== null && Number.isFinite(score) && score >= 0 && score <= 100) expect(html).toContain(`>${score}</span>`);
    else expect(html).toContain("暂无数据");
  });
});
