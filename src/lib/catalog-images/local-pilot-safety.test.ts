import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { isLocalPilotEnabled, ownedPilotPng } from "./testing/local-pilot-fixture";

describe("local pilot safety", () => {
  it("runs in a new unlinked stack and cleans it in finally, including failed tests", () => {
    const script = readFileSync("scripts/test-local-mirror-pilot.ps1", "utf8");
    expect(script).toContain("[guid]::NewGuid().ToString('N').Substring(0,16)");
    expect(script).toContain("} finally {");
    expect(script).toContain("@('stop','--no-backup','--project-id',$pilotProject)");
    expect(script).toContain("com.supabase.cli.project=$pilotProject");
    expect(script).toContain("Remove-Item -LiteralPath $resolved");
    expect(script).toContain("$SimulateTestFailure");
    expect(script).not.toMatch(/--linked|db\s+push|migration\s+repair|--all/);
    expect(script).not.toContain("Get-Content .env");
  });
  it("requires explicit opt-in, a dedicated project and the exact isolated endpoint", () => {
    const env = { PRICEAI_LOCAL_MIRROR_PILOT: "1", PRICEAI_LOCAL_MIRROR_PILOT_PROJECT: `PriceAIPilot${"a".repeat(16)}`, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55421" };
    expect(isLocalPilotEnabled(env)).toBe(true);
    expect(isLocalPilotEnabled({})).toBe(false);
    expect(isLocalPilotEnabled({ ...env, PRICEAI_LOCAL_MIRROR_PILOT_PROJECT: "PriceAI" })).toBe(false);
    expect(isLocalPilotEnabled({ ...env, PRICEAI_LOCAL_MIRROR_PILOT_PROJECT: `PriceAIPilot${"a".repeat(32)}` })).toBe(false);
    for (const url of ["https://example.supabase.co", "http://localhost:54321", "http://127.0.0.1:54321", "http://127.0.0.1:55421/other"]) {
      expect(isLocalPilotEnabled({ ...env, NEXT_PUBLIC_SUPABASE_URL: url })).toBe(false);
    }
  });

  it("generates a complete owned PNG with decompressible pixels, not just a header", () => {
    const png = ownedPilotPng();
    expect(png.subarray(12, 16).toString()).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(10);
    expect(png.readUInt32BE(20)).toBe(20);
    const length = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString()).toBe("IDAT");
    expect(inflateSync(png.subarray(41, 41 + length))).toHaveLength(20 * 31);
    expect(png.subarray(-8, -4).toString()).toBe("IEND");
  });
});
