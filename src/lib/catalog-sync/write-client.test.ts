import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CatalogSyncConfigurationError, getCatalogSyncWriteClient } from "./write-client";

describe("catalog sync write client", () => {
  it("fails safely when server-only write configuration is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getCatalogSyncWriteClient()).toThrow(CatalogSyncConfigurationError);
    vi.unstubAllEnvs();
  });
});
