import { formatPrice } from "@/lib/pricing/offers";
import { getBestCompareValue } from "@/lib/compare/compare-products";
import type { CompareMetric, CompareMetricDirection, CompareProductViewModel } from "@/lib/compare/types";

type CompareRow = {
  label: string;
  value: (product: CompareProductViewModel) => string | number | null;
  bestMetric?: CompareMetric;
  bestDirection?: CompareMetricDirection;
};

const rows: CompareRow[] = [
  { label: "品牌", value: (product) => product.brand },
  { label: "商品名称", value: (product) => product.name },
  { label: "性价比分", value: (product) => product.valueScore, bestMetric: "valueScore", bestDirection: "highest" },
  { label: "最低有效价格", value: (product) => product.lowestPrice === null ? null : formatPrice(product.lowestPrice), bestMetric: "lowestPrice", bestDirection: "lowest" },
  { label: "最低价平台", value: (product) => product.lowestPricePlatform },
  { label: "CPU / 芯片", value: (product) => product.chip },
  { label: "内存 / 存储", value: (product) => product.storage },
  { label: "屏幕", value: (product) => product.screen },
  { label: "电池", value: (product) => product.battery },
  { label: "摄像头 / 影像", value: (product) => product.camera },
  { label: "Rating", value: (product) => product.rating, bestMetric: "rating", bestDirection: "highest" },
  { label: "Sales", value: (product) => product.sales, bestMetric: "sales", bestDirection: "highest" },
  { label: "有效 Offer 数量", value: (product) => product.offerCount },
];

function display(value: string | number | null): string | number {
  return value ?? "暂无数据";
}

function metricValue(product: CompareProductViewModel, metric: CompareMetric): number | null {
  return product[metric];
}

export function CompareTable({ products }: { products: CompareProductViewModel[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-[44rem] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="sticky left-0 z-10 min-w-36 bg-slate-50 px-4 py-4 font-semibold text-slate-950">对比项</th>
            {products.map((product) => (
              <th className="min-w-48 px-4 py-4 font-semibold text-slate-950" key={product.id}>
                <span className="block text-xs font-medium text-blue-700">{product.brand}</span>
                <span className="mt-1 block">{product.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const bestValue = row.bestMetric && row.bestDirection ? getBestCompareValue(products, row.bestMetric, row.bestDirection) : null;

            return (
              <tr className="border-b border-slate-100 last:border-b-0" key={row.label}>
                <th className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-700">{row.label}</th>
                {products.map((product) => {
                  const value = row.value(product);
                  const isBest = row.bestMetric !== undefined && bestValue !== null && metricValue(product, row.bestMetric) === bestValue;

                  return (
                    <td className="px-4 py-3 text-slate-700" key={product.id}>
                      <span className={isBest ? "rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800" : undefined}>{display(value)}</span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
