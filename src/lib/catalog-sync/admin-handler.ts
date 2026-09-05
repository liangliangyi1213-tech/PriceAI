import "server-only";

import { PlatformAdapterError, PlatformRateLimitError } from "@/lib/platforms/errors";

import { CatalogSyncObservabilityError, createCatalogSyncRunner } from "./runner";
import type { CatalogSyncRunResult } from "./types";

const MAX_QUERY_LENGTH = 120;
type SupportedAdminPlatform = "mock" | "pdd";
type Runner = { runCatalogSync(input: { platform: SupportedAdminPlatform; query: string; dryRun: boolean }): Promise<CatalogSyncRunResult> };

function json(body: unknown, status = 200): Response { return Response.json(body, { status, headers: { "cache-control": "no-store" } }); }
function invalid(message: string): Response { return json({ error: message }, 400); }

function parseInput(value: unknown): { platform: SupportedAdminPlatform; query: string; dryRun: boolean } | Response {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("请求体格式无效。");
  const body = value as Record<string, unknown>;
  if (body.platform !== "mock" && body.platform !== "pdd") return invalid("当前管理入口仅支持 Mock 或拼多多平台。");
  const query = body.platform === "pdd" ? "推荐商品池" : typeof body.query === "string" ? body.query.trim() : "";
  if (body.platform === "mock" && !query) return invalid("查询词不能为空。");
  if (query.length > MAX_QUERY_LENGTH) return invalid(`查询词不能超过 ${MAX_QUERY_LENGTH} 个字符。`);
  if (typeof body.dryRun !== "boolean") return invalid("dryRun 必须为布尔值。");
  if (body.platform === "pdd" && !body.dryRun) return invalid("拼多多推荐商品池当前仅支持预览同步。");
  return { platform: body.platform, query, dryRun: body.dryRun };
}

function safeErrorResponse(error: unknown): Response {
  if (error instanceof CatalogSyncObservabilityError) return json({ error: "同步批次记录不可用，请稍后重试。" }, 503);
  if (error instanceof PlatformRateLimitError) return json({ error: error.message }, 429);
  if (error instanceof PlatformAdapterError) return json({ error: error.message }, 502);
  return json({ error: "商品目录同步失败，请稍后重试。" }, 500);
}

export async function handleCatalogSyncAdminRequest(request: Request, {
  isDevelopment = process.env.NODE_ENV !== "production",
  runner = createCatalogSyncRunner(),
}: { isDevelopment?: boolean; runner?: Runner } = {}): Promise<Response> {
  if (!isDevelopment) return json({ error: "该管理入口仅在开发环境可用。" }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return invalid("请求体必须是 JSON。"); }
  const input = parseInput(body);
  if (input instanceof Response) return input;
  try {
    const result = await runner.runCatalogSync(input);
    const partial = result.syncResult?.writeFailures.length ? "partial_failure" : "success";
    return json({ runId: result.runId, status: partial, dryRun: result.dryRun, platform: input.platform, query: input.query, summary: { fetchedCount: result.preview.fetchedCount, matchedCount: result.preview.matchedCount, unmatchedCount: result.preview.unmatchedCount, ambiguousCount: result.preview.ambiguousCount, rejectedCount: result.preview.rejectedCount, offerUpserts: result.syncResult?.persisted ?? result.preview.offerUpserts, priceHistorySnapshots: result.syncResult?.snapshotsRecorded ?? result.preview.priceHistorySnapshots, writeFailureCount: result.syncResult?.writeFailures.length ?? 0 }, preview: result.preview });
  } catch (error) { return safeErrorResponse(error); }
}
