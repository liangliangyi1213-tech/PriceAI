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
      const { error } = await getSupabase().from("product_insights").upsert(
        {
          product_id: productId,
          variant_id: variantId,
          facts_hash: factsHash,
          insight,
          model,
        },
        { onConflict: "product_id,variant_id,facts_hash", ignoreDuplicates: true },
      );

      if (error) throw error;
    },
  };
}
