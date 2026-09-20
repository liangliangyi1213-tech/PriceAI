import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function seedSql(): string {
  return readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");
}

describe("local Supabase seed contract", () => {
  it("provides deterministic legacy offer identities for every seeded offer", () => {
    const sql = seedSql();
    const offerInserts = sql.match(/insert\s+into\s+public\.offers\([\s\S]*?\)\s+select[\s\S]*?on\s+conflict\(id\)\s+do\s+nothing;/gi) ?? [];

    expect(offerInserts).toHaveLength(3);

    for (const insert of offerInserts) {
      expect(insert).toMatch(/offer_identity/i);
      expect(insert).toMatch(/'legacy:'\s*\|\|\s*v\.id/i);
    }
  });
});
