import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

export const CATALOG_IMAGE_ADMIN_COOKIE = "priceai_catalog_image_admin";
export const CATALOG_IMAGE_ADMIN_SESSION_SECONDS = 4 * 60 * 60;

type AdminEnvironment = Readonly<Record<string, string | undefined>>;

export type CatalogImageAdminConfig = Readonly<{ secret: string }>;
export type CatalogImageAdminAccess = "disabled" | "unauthorized" | "authorized";

export function getCatalogImageAdminConfig(
  environment: AdminEnvironment = process.env,
): CatalogImageAdminConfig | null {
  const secret = environment.PRICEAI_ADMIN_SECRET?.trim();
  return environment.PRICEAI_ADMIN_ENABLED === "true" && secret && secret.length >= 16
    ? { secret }
    : null;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function verifyCatalogImageAdminSecret(candidate: string, expected: string): boolean {
  return timingSafeEqual(digest(candidate), digest(expected));
}

function sessionSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createCatalogImageAdminSession(
  secret: string,
  now = Date.now(),
  nonce = randomBytes(18).toString("base64url"),
): string {
  const expiresAt = Math.floor(now / 1_000) + CATALOG_IMAGE_ADMIN_SESSION_SECONDS;
  const payload = `v1.${expiresAt}.${nonce}`;
  return `${payload}.${sessionSignature(payload, secret)}`;
}

export function isCatalogImageAdminSessionValid(
  token: string | null | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1_000)) return false;
  const payload = parts.slice(0, 3).join(".");
  const actual = parts[3];
  return timingSafeEqual(digest(actual), digest(sessionSignature(payload, secret)));
}

export function catalogImageAdminCookieOptions(production: boolean) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: production,
    maxAge: CATALOG_IMAGE_ADMIN_SESSION_SECONDS,
    path: "/admin/catalog-images",
  };
}

export function isSameOriginAdminRequest({
  origin,
  host,
  forwardedHost,
}: Readonly<{ origin: string | null; host: string | null; forwardedHost?: string | null }>): boolean {
  const expectedHost = forwardedHost?.split(",")[0]?.trim() || host?.trim();
  if (!origin || !expectedHost) return false;
  try {
    const url = new URL(origin);
    return !url.username && !url.password && url.host.toLowerCase() === expectedHost.toLowerCase();
  } catch {
    return false;
  }
}

export async function getCatalogImageAdminAccess(): Promise<CatalogImageAdminAccess> {
  const config = getCatalogImageAdminConfig();
  if (!config) return "disabled";
  const token = (await cookies()).get(CATALOG_IMAGE_ADMIN_COOKIE)?.value;
  return isCatalogImageAdminSessionValid(token, config.secret) ? "authorized" : "unauthorized";
}
