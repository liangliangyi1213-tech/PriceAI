export type RankingCategory = {
  id: "phones" | "computers" | "headphones" | "appliances";
  label: string;
  title: string;
  description: string;
  href: string | null;
  status: "available" | "coming_soon";
};

export const rankingCategories: readonly RankingCategory[] = [
  {
    id: "phones",
    label: "手机",
    title: "手机性价比榜",
    description: "综合当前收录报价、配置、口碑与保障，找到更值得关注的手机。",
    href: "/rankings/phones",
    status: "available",
  },
  {
    id: "computers",
    label: "电脑",
    title: "电脑榜单",
    description: "将在建立完整商品目录和评分模型后开放。",
    href: null,
    status: "coming_soon",
  },
  {
    id: "headphones",
    label: "耳机",
    title: "耳机榜单",
    description: "将在建立完整商品目录和评分模型后开放。",
    href: null,
    status: "coming_soon",
  },
  {
    id: "appliances",
    label: "家电",
    title: "家电榜单",
    description: "将在建立完整商品目录和评分模型后开放。",
    href: null,
    status: "coming_soon",
  },
];
