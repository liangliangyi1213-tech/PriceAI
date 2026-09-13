import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  catalogImageAdminCookieOptions,
  createCatalogImageAdminSession,
  getCatalogImageAdminConfig,
  isCatalogImageAdminSessionValid,
  isSameOriginAdminRequest,
  verifyCatalogImageAdminSecret,
} from "./catalog-image-auth";

describe("Catalog image admin gate", () => {
  const secret = "a-long-server-only-admin-secret";

  it("keeps the route disabled unless both the feature flag and secret are configured", () => {
    expect(getCatalogImageAdminConfig({})).toBeNull();
    expect(getCatalogImageAdminConfig({ PRICEAI_ADMIN_ENABLED: "false", PRICEAI_ADMIN_SECRET: secret })).toBeNull();
    expect(getCatalogImageAdminConfig({ PRICEAI_ADMIN_ENABLED: "true" })).toBeNull();
    expect(getCatalogImageAdminConfig({ PRICEAI_ADMIN_ENABLED: "true", PRICEAI_ADMIN_SECRET: secret }))
      .toEqual({ secret });
  });

  it("compares the admin secret without returning or embedding it", () => {
    expect(verifyCatalogImageAdminSecret(secret, secret)).toBe(true);
    expect(verifyCatalogImageAdminSecret("wrong-secret", secret)).toBe(false);
    const token = createCatalogImageAdminSession(secret, 1_000, "nonce-for-test");
    expect(token).not.toContain(secret);
  });

  it("signs a short-lived session and rejects expired or tampered tokens", () => {
    const token = createCatalogImageAdminSession(secret, 1_000, "nonce-for-test");
    expect(isCatalogImageAdminSessionValid(token, secret, 1_001)).toBe(true);
    expect(isCatalogImageAdminSessionValid(token, secret, 1_000 + 4 * 60 * 60 * 1_000 + 1)).toBe(false);
    expect(isCatalogImageAdminSessionValid(`${token}tampered`, secret, 1_001)).toBe(false);
  });

  it("uses hardened cookie settings without storing the raw secret", () => {
    expect(catalogImageAdminCookieOptions(false)).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      maxAge: 4 * 60 * 60,
      path: "/admin/catalog-images",
    });
    expect(catalogImageAdminCookieOptions(true).secure).toBe(true);
  });

  it("accepts only same-origin mutation requests", () => {
    expect(isSameOriginAdminRequest({ origin: "https://price.example", host: "price.example" })).toBe(true);
    expect(isSameOriginAdminRequest({ origin: "http://localhost:3000", host: "localhost:3000" })).toBe(true);
    expect(isSameOriginAdminRequest({ origin: "https://evil.example", host: "price.example" })).toBe(false);
    expect(isSameOriginAdminRequest({ origin: null, host: "price.example" })).toBe(false);
  });
});
