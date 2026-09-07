import "server-only";

import type { PinduoduoCategoryNode, PinduoduoGoodsResponse } from "@/lib/platforms/pinduoduo-client";
import type { Product } from "@/types/catalog";
import { classifyPinduoduoGoods, classifyPinduoduoMerchandiseType } from "./pinduoduo-relevance";

type CategoryClient = {
  getGoodsOptChildren(parentId?: number, options?: { signal?: AbortSignal }): Promise<PinduoduoCategoryNode[]>;
  getGoodsCategoryChildren(parentId?: number, options?: { signal?: AbortSignal }): Promise<PinduoduoCategoryNode[]>;
};

type ExperimentClient = CategoryClient & {
  searchGoods(query: string, options: {
    limit?: number;
    page?: number;
    optId?: number;
    catId?: number;
    useCustomized?: boolean;
  }, requestOptions?: { signal?: AbortSignal }): Promise<PinduoduoGoodsResponse>;
};

type OfficialCategory = { id: number; name: string; level: number };
type Failure = { success: false; errorCode: string | number | null; subCode: string | number | null; subMessage: string | null; requestId: string | null };
export type RecallSummary = {
  providerTotal: number;
  returnedCount: number;
  uniqueCount: number;
  uniqueAccessoryCount: number;
  subjectGoodsCount: number;
  strictMatchCount: number;
};
export type RecallExperimentResult = {
  categories: { opt: OfficialCategory | null; category: OfficialCategory | null };
  variants: Record<"A" | "B" | "C" | "D", ({ success: true } & RecallSummary) | Failure>;
};

const PHONE_NAME = /(?:^|[\s/·>])手机(?:$|[\s/·>])/;
const PHONE_BRANCH = /手机|数码|电器|通信|通讯/;

function officialCategory(node: PinduoduoCategoryNode): OfficialCategory {
  return { id: node.id, name: node.name, level: node.level };
}

async function findPhoneCategory(getChildren: (parentId: number) => Promise<PinduoduoCategoryNode[]>): Promise<OfficialCategory | null> {
  const roots = await getChildren(0);
  const direct = roots.find((node) => PHONE_NAME.test(node.name));
  if (direct) return officialCategory(direct);
  let frontier = roots.filter((node) => PHONE_BRANCH.test(node.name));
  const visited = new Set<number>([0]);
  for (let depth = 0; depth < 3 && frontier.length; depth += 1) {
    const next: PinduoduoCategoryNode[] = [];
    for (const parent of frontier.slice(0, 8)) {
      if (visited.has(parent.id)) continue;
      visited.add(parent.id);
      const children = await getChildren(parent.id);
      const match = children.find((node) => PHONE_NAME.test(node.name));
      if (match) return officialCategory(match);
      next.push(...children.filter((node) => PHONE_BRANCH.test(node.name)));
    }
    frontier = next;
  }
  return null;
}

export async function discoverOfficialPhoneCategories(client: CategoryClient, signal?: AbortSignal) {
  const [opt, category] = await Promise.all([
    findPhoneCategory((parentId) => client.getGoodsOptChildren(parentId, { signal })),
    findPhoneCategory((parentId) => client.getGoodsCategoryChildren(parentId, { signal })),
  ]);
  return { opt, category };
}

export function summarizePinduoduoRecall(products: readonly Product[], query: string, response: PinduoduoGoodsResponse): RecallSummary {
  const unique = [...new Map(response.goods.map((goods) => [goods.goodsId, goods])).values()];
  return {
    providerTotal: response.total,
    returnedCount: response.rawCount,
    uniqueCount: unique.length,
    uniqueAccessoryCount: unique.filter((goods) => classifyPinduoduoMerchandiseType(goods) === "accessory").length,
    subjectGoodsCount: unique.filter((goods) => classifyPinduoduoMerchandiseType(goods) === "subject").length,
    strictMatchCount: unique.filter((goods) => products.some((product) => classifyPinduoduoGoods(query, product, goods) === "subject")).length,
  };
}

function safeFailure(error: unknown): Failure {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = (value: unknown) => typeof value === "string" || typeof value === "number" ? value : null;
  const text = (value: unknown) => typeof value === "string" ? value.slice(0, 160) : null;
  return { success: false, errorCode: code(record.providerCode), subCode: code(record.providerSubCode), subMessage: text(record.providerSubMessage), requestId: text(record.providerRequestId) };
}

export async function runPinduoduoRecallExperiment(client: ExperimentClient, products: readonly Product[], query: string, signal?: AbortSignal): Promise<RecallExperimentResult> {
  const [optResult, categoryResult] = await Promise.all([
    findPhoneCategory((parentId) => client.getGoodsOptChildren(parentId, { signal }))
      .then((value) => ({ value, error: null as Failure | null }))
      .catch((error: unknown) => ({ value: null, error: safeFailure(error) })),
    findPhoneCategory((parentId) => client.getGoodsCategoryChildren(parentId, { signal }))
      .then((value) => ({ value, error: null as Failure | null }))
      .catch((error: unknown) => ({ value: null, error: safeFailure(error) })),
  ]);
  const categories = { opt: optResult.value, category: categoryResult.value };
  const definitions = {
    A: { limit: 100, page: 1 },
    B: { limit: 100, page: 1, ...(categories.opt ? { optId: categories.opt.id } : {}) },
    C: { limit: 100, page: 1, ...(categories.category ? { catId: categories.category.id } : {}) },
    D: { limit: 100, page: 1, ...(categories.opt ? { optId: categories.opt.id } : {}), useCustomized: false },
  } as const;
  const variants = {} as RecallExperimentResult["variants"];
  for (const name of ["A", "B", "C", "D"] as const) {
    if ((name === "B" || name === "D") && !categories.opt) {
      variants[name] = optResult.error ?? { success: false, errorCode: null, subCode: "official_opt_not_found", subMessage: null, requestId: null };
      continue;
    }
    if (name === "C" && !categories.category) {
      variants[name] = categoryResult.error ?? { success: false, errorCode: null, subCode: "official_category_not_found", subMessage: null, requestId: null };
      continue;
    }
    try {
      variants[name] = { success: true, ...summarizePinduoduoRecall(products, query, await client.searchGoods(query, definitions[name], { signal })) };
    } catch (error) {
      variants[name] = safeFailure(error);
    }
  }
  return { categories, variants };
}
