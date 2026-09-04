import type { Product, ProductVariant } from "@/types/catalog";
import { getLowestOffer } from "@/lib/pricing/offers";
import { scoreVariant } from "@/lib/scoring/value-score";

import { hashProductFacts } from "./facts-hash";
import type {
  ProductInsightCacheRepository,
} from "./insight-cache-repository";
import type { ProductFacts, ProductInsight } from "./types";

export const productInsightModel = "gpt-5-mini";

const insightFields = ["verdict", "pros", "cons", "suitableFor", "notSuitableFor", "buyingAdvice"] as const;

const systemPrompt = `You are PriceAI's shopping analysis assistant.
Use only the supplied product facts.
Never invent specifications, prices, ratings, sales, platform offers, scores, warranties, promotions, or other product facts.
Do not change or recalculate the supplied value score.
If information is missing, do not infer it as fact.
最终输出必须使用简体中文。`;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string" },
    pros: { type: "array", items: { type: "string" } },
    cons: { type: "array", items: { type: "string" } },
    suitableFor: { type: "array", items: { type: "string" } },
    notSuitableFor: { type: "array", items: { type: "string" } },
    buyingAdvice: { type: "string" },
  },
  required: insightFields,
} as const;

type SafeOpenAIErrorDetails = {
  name: string;
  status: number | null;
  code: string | null;
  message: string;
  requestId: string | null;
};

function getStringProperty(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

function redactSecrets(message: string): string {
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");
}

export function getSafeOpenAIErrorDetails(error: unknown): SafeOpenAIErrorDetails {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const fallbackMessage = error instanceof Error ? error.message : "Unknown OpenAI error";
  const status = record.status;

  return {
    name: getStringProperty(record, "name") ?? "OpenAIError",
    status: typeof status === "number" ? status : null,
    code: getStringProperty(record, "code"),
    message: redactSecrets(getStringProperty(record, "message") ?? fallbackMessage),
    requestId: getStringProperty(record, "requestID") ?? getStringProperty(record, "request_id"),
  };
}

function logOpenAIFailure(stage: "configuration" | "request" | "parse", error: unknown, requestId?: string | null) {
  const details = getSafeOpenAIErrorDetails(error);

  console.error(
    `[PriceAI][OpenAI] insight generation failed ${JSON.stringify({
      stage,
      ...details,
      requestId: requestId ?? details.requestId,
    })}`,
  );
}

function logCacheFailure(operation: "read" | "write", error: unknown) {
  const details = getSafeOpenAIErrorDetails(error);

  console.error(
    `[PriceAI][InsightCache] ${operation} failed ${JSON.stringify(details)}`,
  );
}

export function buildProductFacts(product: Product, variant: ProductVariant): ProductFacts {
  return {
    productName: product.name,
    brand: product.brand,
    valueScore: scoreVariant(variant).total,
    specs: product.specs,
    variant: {
      storage: variant.storage,
      color: variant.color,
      region: variant.region,
      condition: variant.condition,
    },
    offers: variant.offers.map((offer) => ({
      platform: offer.platform,
      price: offer.price,
      rating: offer.rating,
      sales: offer.sales,
      afterSales: offer.warranty,
    })),
    lowestPrice: getLowestOffer(variant.offers)?.price ?? null,
  };
}

export function fallbackInsight(facts: ProductFacts): ProductInsight {
  const valueSummary = facts.valueScore >= 80 ? "综合性价比较高" : "建议结合预算谨慎比较";
  const priceSummary = facts.lowestPrice === null ? "暂无可用最低价" : "已识别当前最低价";

  return {
    verdict: `${valueSummary}。`,
    pros: [`当前可比较 ${facts.offers.length} 个平台报价`, priceSummary],
    cons: ["分析仅基于当前已知商品信息"],
    suitableFor: ["希望比较现有平台报价的用户"],
    notSuitableFor: ["需要未提供参数或实时促销信息的用户"],
    buyingAdvice: `请以 ${facts.valueScore}/100 的程序评分与当前平台报价为参考，确认规格后再购买。`,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Validates model output before it is rendered by the product page. */
export function parseProductInsight(value: unknown): ProductInsight | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.verdict !== "string" ||
    !isStringArray(candidate.pros) ||
    !isStringArray(candidate.cons) ||
    !isStringArray(candidate.suitableFor) ||
    !isStringArray(candidate.notSuitableFor) ||
    typeof candidate.buyingAdvice !== "string"
  ) {
    return null;
  }

  return {
    verdict: candidate.verdict,
    pros: candidate.pros,
    cons: candidate.cons,
    suitableFor: candidate.suitableFor,
    notSuitableFor: candidate.notSuitableFor,
    buyingAdvice: candidate.buyingAdvice,
  };
}

export type ProductInsightDependencies = {
  cache?: ProductInsightCacheRepository;
  generate?: (facts: ProductFacts) => Promise<ProductInsight | null>;
};

async function generateProductInsight(facts: ProductFacts): Promise<ProductInsight | null> {

  if (!process.env.OPENAI_API_KEY) {
    logOpenAIFailure("configuration", {
      name: "OpenAIConfigurationError",
      code: "missing_api_key",
      message: "OPENAI_API_KEY is not available to the server runtime.",
    });
    return null;
  }

  let response: { output_text: string; _request_id?: string | null };
  try {
    const { getOpenAIClient } = await import("./client");
    response = await getOpenAIClient().responses.create({
      model: productInsightModel,
      store: false,
      instructions: systemPrompt,
      input: JSON.stringify(facts),
      text: {
        format: { type: "json_schema", name: "product_insight", strict: true, schema },
      },
    });
  } catch (error) {
    logOpenAIFailure("request", error);
    return null;
  }

  try {
    const insight = parseProductInsight(JSON.parse(response.output_text));
    if (insight) return insight;

    logOpenAIFailure(
      "parse",
      {
        name: "StructuredOutputValidationError",
        code: "invalid_structured_output",
        message: "OpenAI API request succeeded, but the structured output did not match ProductInsight.",
      },
      response._request_id,
    );
  } catch (error) {
    logOpenAIFailure("parse", error, response._request_id);
  }

  return null;
}

async function getDefaultCacheRepository(): Promise<ProductInsightCacheRepository> {
  const { getProductInsightCacheRepository } = await import("./insight-cache-repository");
  return getProductInsightCacheRepository();
}

export async function getProductInsight(
  product: Product,
  variant: ProductVariant,
  dependencies: ProductInsightDependencies = {},
): Promise<ProductInsight> {
  const facts = buildProductFacts(product, variant);
  const factsHash = hashProductFacts(facts);
  const cacheKey = { productId: product.id, variantId: variant.id, factsHash };
  let cache = dependencies.cache;

  if (!cache) {
    try {
      cache = await getDefaultCacheRepository();
    } catch (error) {
      logCacheFailure("read", error);
    }
  }

  if (cache) {
    try {
      const cachedInsight = await cache.get(cacheKey);
      const parsedInsight = parseProductInsight(cachedInsight);
      if (parsedInsight) return parsedInsight;

      if (cachedInsight !== null) {
        logCacheFailure("read", new Error("Cached ProductInsight has an invalid shape."));
      }
    } catch (error) {
      logCacheFailure("read", error);
    }
  }

  const insight = await (dependencies.generate ?? generateProductInsight)(facts);
  if (!insight) return fallbackInsight(facts);

  if (cache) {
    try {
      await cache.upsert({ ...cacheKey, insight, model: productInsightModel });
    } catch (error) {
      logCacheFailure("write", error);
    }
  }

  return insight;
}
