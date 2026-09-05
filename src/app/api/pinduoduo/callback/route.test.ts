import { describe, expect, it } from "vitest";
import { GET } from "./route";

function callbackRequest(query = ""): Request {
  return new Request(`https://price-ai-tan.vercel.app/api/pinduoduo/callback${query}`);
}

describe("GET /api/pinduoduo/callback", () => {
  it("returns 400 when the authorization code is missing", async () => {
    const response = await GET(callbackRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "缺少授权 code。",
    });
  });

  it("returns a safe authorization failure when error is present", async () => {
    const response = await GET(callbackRequest("?error=access_denied&code=must_not_leak"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      message: "拼多多授权失败。",
    });
    expect(JSON.stringify(body)).not.toContain("access_denied");
    expect(JSON.stringify(body)).not.toContain("must_not_leak");
  });

  it("acknowledges a test code without returning it", async () => {
    const response = await GET(callbackRequest("?code=test_code"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: "PriceAI 已成功接收到拼多多授权回调。",
      callbackReceived: true,
      stateReceived: false,
    });
    expect(JSON.stringify(body)).not.toContain("test_code");
  });

  it("only confirms that state exists", async () => {
    const response = await GET(callbackRequest("?code=test_code&state=test_state"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stateReceived).toBe(true);
    expect(JSON.stringify(body)).not.toContain("test_code");
    expect(JSON.stringify(body)).not.toContain("test_state");
  });

  it("does not cache callback responses", async () => {
    const response = await GET(callbackRequest("?code=test_code"));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
