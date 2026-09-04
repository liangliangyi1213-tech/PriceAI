import { handleCatalogSyncAdminRequest } from "@/lib/catalog-sync/admin-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleCatalogSyncAdminRequest(request);
}
