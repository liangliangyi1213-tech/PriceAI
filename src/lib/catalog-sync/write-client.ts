import "server-only";

import { createClient } from "@supabase/supabase-js";

export class CatalogSyncConfigurationError extends Error {
  constructor() { super("Catalog sync writes are not configured for this server runtime."); this.name = "CatalogSyncConfigurationError"; }
}

/** Creates a server-only writer. No public environment variable can grant catalog write access. */
export function getCatalogSyncWriteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new CatalogSyncConfigurationError();
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
