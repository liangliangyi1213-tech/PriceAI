export type CatalogImageDiscoveryOption = Readonly<{
  id: string;
  name: string;
  category: string;
  supported: boolean;
}>;

export type CatalogImageDiscoveryResult = Readonly<{
  status: "success" | "failed";
  created: number;
  duplicate: number;
  skipped: number;
  rejected: number;
  failed: number;
  productRefs: readonly string[];
}>;

type Props = Readonly<{
  action: (formData: FormData) => Promise<never>;
  options: readonly CatalogImageDiscoveryOption[];
  result: CatalogImageDiscoveryResult | null;
}>;

function ResultBanner({ result }: { result: CatalogImageDiscoveryResult }) {
  if (result.status === "failed") {
    return <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">候选图片发现未完成，请稍后重试。</p>;
  }
  return <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-800"><p className="font-semibold">候选发现已完成</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1"><span>新增 {result.created}</span><span>重复 {result.duplicate}</span><span>跳过 {result.skipped}</span><span>拒绝 {result.rejected}</span><span>失败 {result.failed}</span></div>{result.productRefs.length ? <p className="mt-2 text-xs text-emerald-700">Catalog 标识：{result.productRefs.join(" · ")}</p> : null}</div>;
}

export function CatalogImageDiscoveryPanel({ action, options, result }: Props) {
  const supported = options.filter((option) => option.supported);
  return <section aria-label="发现候选图片" className="mt-6 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Manual Discovery</p><h2 className="mt-1 text-xl font-bold text-slate-950">发现候选图片</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">仅调用具备严格 matcher 的平台；新图片只进入 Candidate 队列，不会自动审核或替换主图。</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">最多 10 个 Product</span></div>{result ? <ResultBanner result={result}/> : null}<div className="mt-5 grid gap-4 lg:grid-cols-2"><form action={action} className="rounded-2xl border border-slate-200 p-4"><input name="mode" type="hidden" value="single"/><label className="text-sm font-bold text-slate-900" htmlFor="discovery-current-product">当前商品</label><p className="mt-1 text-xs text-slate-500">对一个已支持严格匹配的 Catalog 商品进行受控发现。</p><select className="mt-3 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" defaultValue="" id="discovery-current-product" name="productId" required><option disabled value="">选择 Catalog 商品</option>{supported.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.category}</option>)}</select><button className="mt-3 h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" type="submit">发现当前商品 Candidate</button></form><form action={action} className="rounded-2xl border border-slate-200 p-4"><input name="mode" type="hidden" value="batch"/><label className="text-sm font-bold text-slate-900" htmlFor="discovery-batch-products">小批量 Catalog 商品</label><p className="mt-1 text-xs text-slate-500">可选择多个商品；服务端严格限制单次最多 10 个。</p><select className="mt-3 min-h-32 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm" id="discovery-batch-products" multiple name="productId" required size={Math.min(6, Math.max(3, supported.length))}>{supported.map((option) => <option className="rounded px-2 py-1.5" key={option.id} value={option.id}>{option.name} · {option.category}</option>)}</select><button className="mt-3 h-10 rounded-xl border border-blue-200 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50" type="submit">批量发现 Candidate</button></form></div>{options.some((option) => !option.supported) ? <p className="mt-3 text-xs text-slate-400">未配置可靠 matcher 的品类不会出现在可选列表，也不会误用手机匹配规则。</p> : null}</section>;
}
