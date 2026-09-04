export const compareProductLimit = 4;

type CompareParam = string | string[] | undefined;

/** Parses a shareable comparison URL without validating catalog existence. */
export function parseCompareQuery(value: CompareParam): string[] {
  const rawValues = Array.isArray(value) ? value : [value];
  const slugs = rawValues
    .flatMap((item) => item?.split(",") ?? [])
    .map((slug) => slug.trim())
    .filter(Boolean);

  return slugs.filter((slug, index) => slugs.indexOf(slug) === index).slice(0, compareProductLimit);
}
