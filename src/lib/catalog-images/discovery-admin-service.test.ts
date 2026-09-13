import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CatalogImageDiscoveryAdminError,
  executeCatalogImageDiscoveryAdminOperation,
} from "./discovery-admin-service";

describe("catalog image discovery admin service", () => {
  it("rejects an unauthorized request before discovery starts", async () => {
    const runDiscovery = vi.fn();

    await expect(executeCatalogImageDiscoveryAdminOperation({
      authorized: false,
      sameOrigin: true,
      input: { mode: "single", productIds: ["product-1"] },
    }, { runDiscovery })).rejects.toEqual(new CatalogImageDiscoveryAdminError("unauthorized"));

    expect(runDiscovery).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin request before discovery starts", async () => {
    const runDiscovery = vi.fn();

    await expect(executeCatalogImageDiscoveryAdminOperation({
      authorized: true,
      sameOrigin: false,
      input: { mode: "single", productIds: ["product-1"] },
    }, { runDiscovery })).rejects.toEqual(new CatalogImageDiscoveryAdminError("invalid_origin"));

    expect(runDiscovery).not.toHaveBeenCalled();
  });

  it("returns only the safe discovery report", async () => {
    const safeReport = {
      summary: { created: 1, duplicate: 0, skipped: 0, rejected: 0, failed: 0 },
      products: [{ productRef: "pr••-1", productName: "商品一", status: "completed", created: 1, duplicate: 0, skipped: 0, rejected: 0, failed: 0 }],
    } as const;
    const runDiscovery = vi.fn().mockResolvedValue(safeReport);

    await expect(executeCatalogImageDiscoveryAdminOperation({
      authorized: true,
      sameOrigin: true,
      input: { mode: "single", productIds: ["product-1"] },
    }, { runDiscovery })).resolves.toEqual(safeReport);
  });
});
