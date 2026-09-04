import { describe, expect, it } from "vitest";

import {
  PlatformAuthError,
  PlatformRateLimitError,
  PlatformRequestError,
  toSafePlatformError,
} from "./errors";

describe("platform errors", () => {
  it("converts a provider failure into a safe request error without leaking its message", () => {
    const error = toSafePlatformError("jd", new Error("Authorization: Bearer private-token"));

    expect(error).toBeInstanceOf(PlatformRequestError);
    expect(error.message).not.toContain("private-token");
    expect(error.message).toBe("京东平台请求失败，请稍后重试。");
  });

  it("classifies authentication and rate-limit status codes", () => {
    expect(toSafePlatformError("taobao", { status: 401 })).toBeInstanceOf(PlatformAuthError);
    expect(toSafePlatformError("taobao", { status: 429 })).toBeInstanceOf(PlatformRateLimitError);
  });
});
