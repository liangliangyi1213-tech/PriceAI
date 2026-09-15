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
import { executeCatalogImageDiscoveryAdminOperation } from "@/lib/catalog-images/discovery-admin-service";
import type { CatalogImageDiscoveryReport } from "@/lib/catalog-images/discovery-service";
import { executeCatalogImageMirrorHealthAdminOperation } from "@/lib/catalog-images/mirror-health-admin-service";
import { cleanupCatalogImageCandidateOverCap } from "@/lib/catalog-images/over-cap-cleanup-service";

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

function discoveryResultLocation(report: CatalogImageDiscoveryReport): string {
  const params = new URLSearchParams({
    discovery: "success",
    created: String(report.summary.created),
    duplicate: String(report.summary.duplicate),
    suppressed: String(report.summary.suppressed),
    skipped: String(report.summary.skipped),
    rejected: String(report.summary.rejected),
    failed: String(report.summary.failed),
    refs: report.products.map((product) => product.productRef).join(","),
  });
  return `${WORKBENCH_PATH}?${params.toString()}`;
}

export async function discoverCatalogImagesAction(formData: FormData): Promise<never> {
  let location = `${WORKBENCH_PATH}?discovery=failed`;
  try {
    const mode = formData.get("mode") === "batch" ? "batch" : "single";
    const productIds = formData.getAll("productId").map(String);
    const report = await executeCatalogImageDiscoveryAdminOperation({
      authorized: await getCatalogImageAdminAccess() === "authorized",
      sameOrigin: await sameOrigin(),
      input: { mode, productIds },
    });
    revalidatePath(WORKBENCH_PATH);
    location = discoveryResultLocation(report);
  } catch {}
  redirect(location);
}

export async function cleanupCatalogImagesOverCapAction(
  productId: string,
  platform: string,
  formData: FormData,
): Promise<never> {
  let location = `${WORKBENCH_PATH}?cleanup=failed`;
  try {
    const result = await cleanupCatalogImageCandidateOverCap({
      authorized: await getCatalogImageAdminAccess() === "authorized",
      sameOrigin: await sameOrigin(),
      confirmed: formData.get("confirmed") === "yes",
      reviewer: REVIEWER,
      productId,
      platform,
    });
    revalidatePath(WORKBENCH_PATH);
    const params = new URLSearchParams({
      cleanup: "success",
      processed: String(result.processed),
      active: String(result.activeAfter),
    });
    location = `${WORKBENCH_PATH}?${params.toString()}`;
  } catch {}
  redirect(location);
}

export async function recheckCatalogImageMirrorHealthAction(formData: FormData): Promise<never> {
  let location = `${WORKBENCH_PATH}?mirrorHealth=failed`;
  try {
    await executeCatalogImageMirrorHealthAdminOperation({
      authorized: await getCatalogImageAdminAccess() === "authorized",
      sameOrigin: await sameOrigin(),
      imageId: String(formData.get("imageId") ?? ""),
      mode: formData.get("mode") === "deep" ? "deep" : "shallow",
    });
    revalidatePath(WORKBENCH_PATH);
    location = `${WORKBENCH_PATH}?mirrorHealth=success`;
  } catch {}
  redirect(location);
}
