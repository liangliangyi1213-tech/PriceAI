import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";

import { buildProductFacts, fallbackInsight, getSafeOpenAIErrorDetails, parseProductInsight } from "./product-insight";

describe("AI product facts", () => {
  const facts = buildProductFacts(phones[0], phones[0].variants[0]);

  it("uses only domain facts", () => {
    expect(facts.lowestPrice).toBe(7599);
    expect(facts.valueScore).toBeGreaterThan(0);
    expect(facts.offers.map((offer) => offer.platform)).toEqual(["京东", "淘宝", "拼多多"]);
  });

  it("creates a deterministic fallback without invented product facts", () => {
    const insight = fallbackInsight(facts);

    expect(insight.pros).toContain("已识别当前最低价");
    expect(insight.buyingAdvice).toContain(`${facts.valueScore}/100`);
  });

  it("accepts only the expected structured insight shape", () => {
    const valid = {
      verdict: "适合比较当前报价后购买。",
      pros: ["已有多个报价"],
      cons: ["信息有限"],
      suitableFor: ["重视比价的用户"],
      notSuitableFor: ["需要实时促销信息的用户"],
      buyingAdvice: "确认规格后再下单。",
    };

    expect(parseProductInsight(valid)).toEqual(valid);
    expect(parseProductInsight({ ...valid, pros: "不是数组" })).toBeNull();
  });

  it("keeps only safe OpenAI error metadata for server logs", () => {
    const details = getSafeOpenAIErrorDetails({
      name: "AuthenticationError",
      status: 401,
      code: "invalid_api_key",
      message: "Invalid API key",
      requestID: "req_test",
      headers: { authorization: "secret" },
    });

    expect(details).toEqual({
      name: "AuthenticationError",
      status: 401,
      code: "invalid_api_key",
      message: "Invalid API key",
      requestId: "req_test",
    });
  });
});
