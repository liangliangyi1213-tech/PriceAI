import "server-only";

import { getSupabase } from "@/lib/supabase/client";

import type { ProductInsight } from "./types";

export type ProductInsightCacheKey = {
  productId: string;
  variantId: string;
  factsHash: string;
};

export type ProductInsightCacheRecord = ProductInsightCacheKey & {
  insight: ProductInsight;
  model: string;
};

export type ProductInsightCacheRepository = {
  get(key: ProductInsightCacheKey): Promise<unknown | null>;
  upsert(record: ProductInsightCacheRecord): Promise<void>;
};

type RetryableInsightCacheTransportCode =
  | "ECONNRESET"
  | "ETIMEDOUT"
  | "UND_ERR_CONNECT_TIMEOUT";

const retryableTransportCodes = new Set<RetryableInsightCacheTransportCode>([
  "ECONNRESET",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const writeRetryDelaysMs = [200, 500] as const;

export class InsightCacheWriteError extends Error {
  readonly attempt: number;
  readonly transportCode: RetryableInsightCacheTransportCode | null;

  constructor(attempt: number, transportCode: RetryableInsightCacheTransportCode | null) {
    super("Insight cache write failed.");
    this.name = "InsightCacheWriteError";
    this.attempt = attempt;
    this.transportCode = transportCode;
  }
}

function retryableTransportCode(error: unknown, depth = 0): RetryableInsightCacheTransportCode | null {
  if (!error || typeof error !== "object" || depth > 5) return null;
  const record = error as Record<string, unknown>;
  if (typeof record.code === "string" && retryableTransportCodes.has(record.code as RetryableInsightCacheTransportCode)) {
    return record.code as RetryableInsightCacheTransportCode;
  }
  return retryableTransportCode(record.cause, depth + 1);
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function getProductInsightCacheRepository(): ProductInsightCacheRepository {
  return {
    async get({ productId, variantId, factsHash }) {
      const { data, error } = await getSupabase()
        .from("product_insights")
        .select("insight")
        .eq("product_id", productId)
        .eq("variant_id", variantId)
        .eq("facts_hash", factsHash)
        .maybeSingle();

      if (error) throw error;
      return data?.insight ?? null;
    },
    async upsert({ productId, variantId, factsHash, insight, model }) {
      const row = {
        product_id: productId,
        variant_id: variantId,
        facts_hash: factsHash,
        insight,
        model,
      };
      const options = { onConflict: "product_id,variant_id,facts_hash", ignoreDuplicates: true } as const;

      for (let attempt = 1; attempt <= writeRetryDelaysMs.length + 1; attempt += 1) {
        try {
          const { error } = await getSupabase().from("product_insights").upsert(row, options);
          if (error) throw new InsightCacheWriteError(attempt, null);
          return;
        } catch (error) {
          if (error instanceof InsightCacheWriteError) throw error;
          const code = retryableTransportCode(error);
          const retryDelay = writeRetryDelaysMs[attempt - 1];
          if (!code || retryDelay === undefined) throw new InsightCacheWriteError(attempt, code);

          console.warn(
            "[PriceAI][InsightCacheTransport]",
            JSON.stringify({ operation: "write", attempt, code }),
          );
          await wait(retryDelay);
        }
      }
    },
  };
}
