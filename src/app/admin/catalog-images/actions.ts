"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  CATALOG_IMAGE_ADMIN_COOKIE,
  catalogImageAdminCookieOptions,
  createCatalogImageAdminSession,
  getCatalogImageAdminAccess,
  getCatalogImageAdminConfig,
  isSameOriginAdminRequest,
  verifyCatalogImageAdminSecret,
} from "@/lib/admin/catalog-image-auth";
import { executeCatalogImageAdminOperation, type CatalogImageAdminOperation } from "@/lib/catalog-images/admin-service";

const WORKBENCH_PATH = "/admin/catalog-images";
const REVIEWER = "priceai-admin-workbench";

async function sameOrigin(): Promise<boolean> {
  const requestHeaders = await headers();
  return isSameOriginAdminRequest({
    origin: requestHeaders.get("origin"),
    host: requestHeaders.get("host"),
    forwardedHost: requestHeaders.get("x-forwarded-host"),
  });
}

export async function loginCatalogImageAdminAction(formData: FormData): Promise<never> {
  const config = getCatalogImageAdminConfig();
  const supplied = formData.get("adminSecret");
  if (!config || !(await sameOrigin()) || typeof supplied !== "string"
    || !verifyCatalogImageAdminSecret(supplied, config.secret)) {
    redirect(`${WORKBENCH_PATH}?auth=failed`);
  }
  (await cookies()).set(
    CATALOG_IMAGE_ADMIN_COOKIE,
    createCatalogImageAdminSession(config.secret),
    catalogImageAdminCookieOptions(process.env.NODE_ENV === "production"),
  );
  redirect(WORKBENCH_PATH);
}

async function mutate(operation: CatalogImageAdminOperation): Promise<never> {
  let succeeded = false;
  try {
    await executeCatalogImageAdminOperation({
      authorized: await getCatalogImageAdminAccess() === "authorized",
      sameOrigin: await sameOrigin(),
      reviewer: REVIEWER,
      operation,
    });
    revalidatePath(WORKBENCH_PATH);
    succeeded = true;
  } catch {}
  redirect(`${WORKBENCH_PATH}?result=${succeeded ? "success" : "failed"}`);
}

export async function approveCatalogImageAction(formData: FormData): Promise<never> {
  return mutate({ type: "approve", imageId: String(formData.get("imageId") ?? "") });
}

export async function approveAndPromoteCatalogImageAction(formData: FormData): Promise<never> {
  return mutate({
    type: "approve_primary",
    imageId: String(formData.get("imageId") ?? ""),
    reason: "Approved and promoted from the internal catalog image workbench.",
  });
}

export async function rejectCatalogImageAction(formData: FormData): Promise<never> {
  return mutate({
    type: "reject",
    imageId: String(formData.get("imageId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
}
