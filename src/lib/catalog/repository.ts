import { phones } from "@/data/phones";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Product } from "@/types/catalog";

import { mapCatalog } from "./mapper";

function fallback(error: unknown): Product[] {
  if (process.env.NODE_ENV !== "production") {
    console.warn("Supabase catalog unavailable; using explicit Mock fallback.", error);
    return phones;
  }

  throw error;
}

export async function getProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured()) {
    return fallback(new Error("Supabase 未配置"));
  }

  try {
    const db = getSupabase();
    const [products, variants, offers] = await Promise.all([
      db.from("products").select("*"),
      db.from("product_variants").select("*"),
      db.from("offers").select("*"),
    ]);

    if (products.error || variants.error || offers.error) {
      throw products.error || variants.error || offers.error;
    }

    return mapCatalog(products.data, variants.data, offers.data);
  } catch (error) {
    return fallback(error);
  }
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  return (await getProducts()).find((product) => product.slug === slug);
}
