/** Presentation input only. Future category data can supply an ordered core summary. */
export type SpecificationSource = {
  coreSpecifications?: readonly string[];
  storage?: string;
  color?: string;
  region?: string;
  condition?: string;
};

/** Legacy MVP mapping stays outside the card; never apply phone fields to other categories. */
const categoryFields: Readonly<Record<string, readonly (keyof Omit<SpecificationSource, "coreSpecifications">)[]>> = {
  phone: ["storage", "color", "region", "condition"],
};

export function specificationSummary(category: string, source?: SpecificationSource): string {
  if (!source) return "";
  const values = source.coreSpecifications ?? (categoryFields[category] ?? []).map((field) => source[field] ?? "");
  return values.map((value) => value.trim()).filter(Boolean).join(" · ");
}
