import { afterEach, describe, expect, it } from "vitest";

import { isSupabaseConfigured } from "./client";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function restore(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("NEXT_PUBLIC_SUPABASE_URL", originalUrl);
  restore("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", originalKey);
});

describe("Supabase configuration", () => {
  it("reads configuration when the repository requests it instead of caching module-load values", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

    expect(isSupabaseConfigured()).toBe(true);
  });
});
