import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ access: vi.fn(), workbench: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/admin/catalog-image-auth", () => ({ getCatalogImageAdminAccess: mocks.access }));
vi.mock("@/lib/catalog-images/workbench-service", () => ({ getCatalogImageWorkbench: mocks.workbench }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("./actions", () => ({
  approveCatalogImageAction: vi.fn(),
  approveAndPromoteCatalogImageAction: vi.fn(),
  loginCatalogImageAdminAction: vi.fn(),
  rejectCatalogImageAction: vi.fn(),
}));

import Page from "./page";

const candidate = {
  imageId: "candidate-1", productName: "小米 15", category: "手机", targetType: "product" as const,
  targetLabel: "Product-level", platform: "淘宝", imageUrl: "https://img.alicdn.com/admin-candidate.jpg",
  matchConfidence: "100.0%", externalProductId: "12••••7890",
  evidence: { matcher: "taobao_phone_strict", matchLevel: "product" as const, signals: ["brand", "model"] },
  firstSeenAt: "2026-09-10T00:00:00.000Z", lastSeenAt: "2026-09-12T00:00:00.000Z",
  currentPrimary: null, events: [], imagePlatform: "taobao" as const,
};

describe("Catalog image admin page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
    mocks.workbench.mockResolvedValue({ candidates: [candidate] });
  });

  it("is entirely unavailable while the server-only feature flag is disabled", async () => {
    mocks.access.mockResolvedValue("disabled");
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.workbench).not.toHaveBeenCalled();
  });

  it("shows only the generic secret gate to an unauthorized visitor", async () => {
    mocks.access.mockResolvedValue("unauthorized");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("内部图片审核");
    expect(html).toContain('type="password"');
    expect(html).not.toContain("小米 15");
    expect(mocks.workbench).not.toHaveBeenCalled();
  });

  it("renders a candidate queue with safe review operations for an authorized admin", async () => {
    mocks.access.mockResolvedValue("authorized");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("小米 15");
    expect(html).toContain("Product-level");
    expect(html).toContain("批准并设为主图");
    expect(html).toContain("拒绝原因");
    expect(html).not.toContain("1234567890");
  });

  it("keeps database writers and service-role configuration out of page and client component sources", () => {
    const page = readFileSync("src/app/admin/catalog-images/page.tsx", "utf8");
    const actions = readFileSync("src/app/admin/catalog-images/actions.ts", "utf8");
    const image = readFileSync("src/components/admin/catalog-image-preview.tsx", "utf8");
    expect(page).not.toMatch(/\.from\(|service_role|SUPABASE_SERVICE_ROLE_KEY/);
    expect(image).not.toMatch(/\.from\(|service_role|SUPABASE_SERVICE_ROLE_KEY|PRICEAI_ADMIN_SECRET/);
    expect(actions).not.toMatch(/\.from\(|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_/);
  });
});
