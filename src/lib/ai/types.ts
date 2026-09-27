import type { OfferProvenanceKind, OfferProvenanceTrust } from "@/lib/catalog/provenance";

export type ProductInsight = {
  verdict: string;
  pros: string[];
  cons: string[];
  suitableFor: string[];
  notSuitableFor: string[];
  buyingAdvice: string;
};

export type ProductFacts = {
  productName: string;
  brand: string;
  valueScore: number | null;
  specs: Record<string, string>;
  variant: { storage: string; color: string; region: string; condition: string };
  provenance: {
    status: "demonstration" | "verified" | "recorded" | "mixed" | "unknown";
    demonstration: boolean;
    offerKinds: OfferProvenanceKind[];
  };
  offers: Array<{
    platform: string;
    price: number;
    rating: number;
    sales: number;
    afterSales: string | null;
    provenance: {
      kind: OfferProvenanceKind;
      trust: OfferProvenanceTrust;
      demonstration: boolean;
    };
  }>;
  lowestPrice: number | null;
};
