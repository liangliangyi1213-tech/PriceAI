import type { Platform } from "@/types/catalog";

export type CompareMetric = "valueScore" | "lowestPrice" | "rating" | "sales";
export type CompareMetricDirection = "highest" | "lowest";

export type CompareProductViewModel = {
  id: string;
  slug: string;
  brand: string;
  name: string;
  valueScore: number | null;
  lowestPrice: number | null;
  lowestPricePlatform: Platform | null;
  chip: string | null;
  storage: string | null;
  screen: string | null;
  battery: string | null;
  camera: string | null;
  rating: number | null;
  sales: number | null;
  offerCount: number;
};

export type CompareSelectionStatus = "added" | "removed" | "limit_reached";

export type CompareSelectionResult = {
  selectedSlugs: string[];
  status: CompareSelectionStatus;
};
