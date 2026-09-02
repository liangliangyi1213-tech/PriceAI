export function normalizeSearchQuery(value: string): string | null {
  const query = value.trim();
  return query || null;
}
