import { notFound } from "next/navigation";

import { CatalogImagePreview } from "@/components/admin/catalog-image-preview";
import { getCatalogImageAdminAccess } from "@/lib/admin/catalog-image-auth";
import { getCatalogImageWorkbench, type CatalogImageWorkbenchCandidate } from "@/lib/catalog-images/workbench-service";

import {
  approveAndPromoteCatalogImageAction,
  approveCatalogImageAction,
  loginCatalogImageAdminAction,
  rejectCatalogImageAction,
} from "./actions";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "暂无";
  const date = new Date(value);
  return Number.isFinite(date.valueOf())
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "暂无";
}

function LoginGate({ failed }: { failed: boolean }) {
  return <main className="min-h-screen bg-slate-50 px-4 py-16"><div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">PriceAI Internal</p><h1 className="mt-3 text-2xl font-bold text-slate-950">内部图片审核</h1><p className="mt-2 text-sm text-slate-500">请输入内部访问凭据继续。</p>{failed ? <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">暂时无法访问，请检查凭据后重试。</p> : null}<form action={loginCatalogImageAdminAction} className="mt-6 grid gap-3"><label className="text-sm font-medium text-slate-700" htmlFor="admin-secret">访问凭据</label><input autoComplete="current-password" className="h-11 rounded-xl border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" id="admin-secret" name="adminSecret" required type="password"/><button className="h-11 rounded-xl bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700" type="submit">进入审核工作台</button></form></div></main>;
}

function CurrentPrimary({ candidate }: { candidate: CatalogImageWorkbenchCandidate }) {
  const primary = candidate.currentPrimary;
  return <section aria-label="当前主图" className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-900">当前 approved primary</h3><span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-blue-700">{primary ? "已设置" : "暂无"}</span></div>{primary ? <div className="mt-3 grid grid-cols-[5rem_1fr] gap-3"><CatalogImagePreview imagePlatform={primary.imagePlatform} imageUrl={primary.imageUrl} label="当前主图" productName={candidate.productName}/><dl className="grid content-start gap-1 text-xs text-slate-600"><div><dt className="inline">来源：</dt><dd className="inline">{primary.platform}</dd></div><div><dt className="inline">审核时间：</dt><dd className="inline">{formatDate(primary.verifiedAt)}</dd></div><div><dt className="inline">审核主体：</dt><dd className="inline">{primary.verifiedBy ?? "暂无"}</dd></div></dl></div> : <p className="mt-3 text-sm text-slate-500">该目标尚未设置审核主图。</p>}</section>;
}

function CandidateCard({ candidate }: { candidate: CatalogImageWorkbenchCandidate }) {
  return <article className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[18rem_minmax(0,1fr)]"><div><div className="mb-3 flex items-center justify-between gap-2"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Candidate</span><span className="text-xs font-medium text-slate-500">{candidate.platform}</span></div><CatalogImagePreview imagePlatform={candidate.imagePlatform} imageUrl={candidate.imageUrl} label="Candidate 图片" productName={candidate.productName}/><p className="mt-2 text-center text-xs text-slate-400">平台商品 ID：{candidate.externalProductId}</p></div><div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-blue-600">{candidate.category}</p><h2 className="mt-1 text-xl font-bold text-slate-950">{candidate.productName}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${candidate.targetType === "variant" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-700"}`}>{candidate.targetLabel}</span></div><dl className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Match confidence</dt><dd className="mt-1 font-bold text-slate-900">{candidate.matchConfidence}</dd></div><div><dt className="text-slate-500">Matcher</dt><dd className="mt-1 break-words font-medium text-slate-900">{candidate.evidence.matcher}</dd></div><div><dt className="text-slate-500">匹配层级</dt><dd className="mt-1 font-medium text-slate-900">{candidate.evidence.matchLevel}</dd></div><div><dt className="text-slate-500">已核验信号</dt><dd className="mt-1 font-medium text-slate-900">{candidate.evidence.signals.join(" · ") || "暂无"}</dd></div><div><dt className="text-slate-500">首次发现</dt><dd className="mt-1 font-medium text-slate-900">{formatDate(candidate.firstSeenAt)}</dd></div><div><dt className="text-slate-500">最近发现</dt><dd className="mt-1 font-medium text-slate-900">{formatDate(candidate.lastSeenAt)}</dd></div></dl><div className="mt-4 grid gap-4 xl:grid-cols-2"><CurrentPrimary candidate={candidate}/><section aria-label="主图历史" className="rounded-2xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-900">Primary event 历史</h3>{candidate.events.length ? <ul className="mt-3 grid gap-2 text-xs text-slate-600">{candidate.events.slice(0, 5).map((event, index) => <li className="flex justify-between gap-3" key={`${event.createdAt}-${index}`}><span>{event.action} · {event.changedBy}</span><time className="shrink-0">{formatDate(event.createdAt)}</time></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">暂无主图事件。</p>}</section></div><div className="mt-5 flex flex-wrap gap-2"><form action={approveCatalogImageAction}><input name="imageId" type="hidden" value={candidate.imageId}/><button className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50" type="submit">批准</button></form><form action={approveAndPromoteCatalogImageAction}><input name="imageId" type="hidden" value={candidate.imageId}/><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" type="submit">批准并设为主图</button></form></div><form action={rejectCatalogImageAction} className="mt-4 flex flex-col gap-2 rounded-2xl border border-rose-100 bg-rose-50/40 p-3 sm:flex-row"><input name="imageId" type="hidden" value={candidate.imageId}/><label className="sr-only" htmlFor={`reject-${candidate.imageId}`}>拒绝原因</label><input className="h-10 min-w-0 flex-1 rounded-xl border border-rose-200 bg-white px-3 text-sm outline-none focus:border-rose-400" id={`reject-${candidate.imageId}`} maxLength={500} name="reason" placeholder="拒绝原因（必填）" required/><button className="h-10 rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50" type="submit">拒绝</button></form></div></article>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ auth?: string; result?: string }> }) {
  const access = await getCatalogImageAdminAccess();
  if (access === "disabled") notFound();
  const params = await searchParams;
  if (access !== "authorized") return <LoginGate failed={params.auth === "failed"}/>;
  const workbench = await getCatalogImageWorkbench();
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">PriceAI Internal</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Catalog 图片审核</h1><p className="mt-2 text-sm text-slate-500">只处理待人工确认的 Candidate；消费者页面不会读取本队列。</p></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">待审核 {workbench.candidates.length}</span></div>{params.result ? <p className={`mt-5 rounded-xl px-4 py-3 text-sm ${params.result === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{params.result === "success" ? "审核操作已完成。" : "审核操作未完成，请刷新后重试。"}</p> : null}<section aria-label="Candidate 审核队列" className="mt-6 grid gap-5">{workbench.candidates.length ? workbench.candidates.map((candidate) => <CandidateCard candidate={candidate} key={candidate.imageId}/>) : <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><h2 className="text-lg font-bold text-slate-900">当前没有待审核图片</h2><p className="mt-2 text-sm text-slate-500">新的 matched 平台图片进入 Candidate 后会显示在这里。</p></div>}</section></div></main>;
}
