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
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: async (input, init) => {
      try { return await fetch(input, init); }
      catch (error) {
        const codes = new Set<string>();
        const visit = (value: unknown, depth = 0): void => {
          if (!value || typeof value !== "object" || depth > 5) return;
          const item = value as Record<string, unknown>;
          const allowed = ["EPERM", "EACCES", "ERR_NETWORK_ACCESS_DENIED", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"];
          if (typeof item.code === "string" && allowed.includes(item.code)) codes.add(item.code);
          const message = typeof item.message === "string" ? item.message : "";
          for (const [pattern, label] of [[/header|ByteString|character.*255|invalid character/i, "INVALID_HEADER"], [/URL|scheme|protocol|bad port/i, "INVALID_URL"], [/certificate|TLS|SSL/i, "TLS_ERROR"], [/fetch failed/i, "FETCH_FAILED"], [/proxy/i, "PROXY_ERROR"], [/abort/i, "ABORTED"]] as const) {
            if (pattern.test(message)) codes.add(label);
          }
          visit(item.cause, depth + 1);
          if (Array.isArray(item.errors)) item.errors.forEach((nested) => visit(nested, depth + 1));
        };
        visit(error);
        console.error("[PriceAI][CatalogSyncTransport]", JSON.stringify({ codes: [...codes] }));
        throw error;
      }
    } },
  });
}
