import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  access: vi.fn(), workbench: vi.fn(), mirrorOverview: vi.fn(), discoveryOptions: vi.fn(), notFound: vi.fn(),
}));
vi.mock("@/lib/admin/catalog-image-auth", () => ({ getCatalogImageAdminAccess: mocks.access }));
vi.mock("@/lib/catalog-images/workbench-service", () => ({ getCatalogImageWorkbench: mocks.workbench }));
vi.mock("@/lib/catalog-images/mirror-admin-service", () => ({ getCatalogImageMirrorAdminOverview: mocks.mirrorOverview }));
vi.mock("@/lib/catalog-images/discovery-service", () => ({ getCatalogImageDiscoveryOptions: mocks.discoveryOptions }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("./actions", () => ({
  approveCatalogImageAction: vi.fn(),
  approveAndPromoteCatalogImageAction: vi.fn(),
  discoverCatalogImagesAction: vi.fn(),
  loginCatalogImageAdminAction: vi.fn(),
  rejectCatalogImageAction: vi.fn(),
  cleanupCatalogImagesOverCapAction: vi.fn(),
  recheckCatalogImageMirrorHealthAction: vi.fn(),
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
    mocks.workbench.mockResolvedValue({ candidates: [candidate], overCapScopes: [] });
    mocks.mirrorOverview.mockResolvedValue({ items: [{
      imageId: "primary-1", productName: "小米 15", category: "手机", targetLabel: "Product-level",
      platform: "淘宝", mirrored: false, bucket: null, healthStatus: "remote_only", lastCheckedAt: null,
      job: { status: "cancelled", attemptCount: 0, lastErrorCode: "policy_remote_only", leaseExpired: false, retryDue: false, nearAttemptLimit: false },
    }] });
    mocks.discoveryOptions.mockResolvedValue([
      { id: "xiaomi-15", name: "小米 15", category: "phone", supported: true },
      { id: "clothing-1", name: "基础衬衫", category: "clothing", supported: false },
    ]);
  });

  it("is entirely unavailable while the server-only feature flag is disabled", async () => {
    mocks.access.mockResolvedValue("disabled");
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.workbench).not.toHaveBeenCalled();
    expect(mocks.mirrorOverview).not.toHaveBeenCalled();
  });

  it("shows only the generic secret gate to an unauthorized visitor", async () => {
    mocks.access.mockResolvedValue("unauthorized");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("内部图片审核");
    expect(html).toContain('type="password"');
    expect(html).not.toContain("小米 15");
    expect(mocks.workbench).not.toHaveBeenCalled();
    expect(mocks.mirrorOverview).not.toHaveBeenCalled();
  });

  it("shows a redacted mirror health and job overview with explicit shallow and deep checks", async () => {
    mocks.access.mockResolvedValue("authorized");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("镜像健康状态");
    expect(html).toContain("仅远程来源");
    expect(html).toContain("重新检查");
    expect(html).toContain("深度校验 Hash");
    expect(html).toContain("cancelled");
    expect(html).not.toContain("source_url");
    expect(html).not.toContain("externalProductId");
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

  it("renders single and bounded batch discovery controls without exposing platform identities", async () => {
    mocks.access.mockResolvedValue("authorized");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({
      discovery: "success", created: "1", duplicate: "2", suppressed: "4", skipped: "3", rejected: "0", failed: "1", refs: "xi••15",
    }) }));

    expect(html).toContain("发现候选图片");
    expect(html).toContain("当前商品");
    expect(html).toContain("小批量 Catalog 商品");
    expect(html).toContain("最多 10 个 Product");
    expect(html).toContain("新增 1");
    expect(html).toContain("重复 2");
    expect(html).toContain("抑制 4");
    expect(html).toContain("xi••15");
    expect(html).not.toContain("source_url");
    expect(html).not.toContain("externalProductId");
  });

  it("requires explicit confirmation before offering an over-cap cleanup", async () => {
    mocks.access.mockResolvedValue("authorized");
    mocks.workbench.mockResolvedValue({
      candidates: [candidate],
      overCapScopes: [{
        productId: "xiaomi-15", productName: "小米 15", platform: "taobao",
        platformLabel: "淘宝", activeCount: 6, suggestedCleanupCount: 3,
      }],
    });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("整理超额候选");
    expect(html).toContain("当前 6 条");
    expect(html).toContain("建议整理 3 条");
    expect(html).toContain('name="confirmed"');
    expect(html).toContain("required");
  });

  it("does not reflect arbitrary discovery identifiers from URL parameters", async () => {
    mocks.access.mockResolvedValue("authorized");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({
      discovery: "success", refs: "https://provider.example/private?id=1234567890,external-product-1234567890",
    }) }));

    expect(html).not.toContain("provider.example");
    expect(html).not.toContain("1234567890");
  });

  it("keeps database writers and service-role configuration out of page and client component sources", () => {
    const page = readFileSync("src/app/admin/catalog-images/page.tsx", "utf8");
    const actions = readFileSync("src/app/admin/catalog-images/actions.ts", "utf8");
    const image = readFileSync("src/components/admin/catalog-image-preview.tsx", "utf8");
    expect(page).not.toMatch(/\.from\(|service_role|SUPABASE_SERVICE_ROLE_KEY/);
    expect(image).not.toMatch(/\.from\(|service_role|SUPABASE_SERVICE_ROLE_KEY|PRICEAI_ADMIN_SECRET/);
    expect(actions).not.toMatch(/\.from\(|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_|approveCatalogImageCandidate|promoteCatalogImagePrimary/);
  });
});
