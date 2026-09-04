import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * This is intentionally server-only: price collectors require a privileged
 * database client because browser/catalog clients have no write policy.
 */
export function getPriceHistoryWriteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Price history writes are not configured for this server runtime.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
