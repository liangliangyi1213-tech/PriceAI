import { afterEach, describe, expect, it, vi } from "vitest";

import { ProxyAgent, fetch as undiciFetch } from "undici";

vi.mock("server-only", () => ({}));

import { getOpenAIClient, getOpenAIClientOptions, resolveOpenAIProxyUrl } from "./client";

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
const originalHttpsProxy = process.env.HTTPS_PROXY;
const originalHttpProxy = process.env.HTTP_PROXY;

function restoreEnvironment(
  name: "OPENAI_API_KEY" | "OPENAI_BASE_URL" | "HTTPS_PROXY" | "HTTP_PROXY",
  value: string | undefined,
) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnvironment("OPENAI_API_KEY", originalOpenAIKey);
  restoreEnvironment("OPENAI_BASE_URL", originalOpenAIBaseUrl);
  restoreEnvironment("HTTPS_PROXY", originalHttpsProxy);
  restoreEnvironment("HTTP_PROXY", originalHttpProxy);
});

describe("OpenAI server proxy configuration", () => {
  it("creates normal direct-connect options when no proxy variable is present", () => {
    const options = getOpenAIClientOptions("test-api-key", {});

    expect(options.fetch).toBeUndefined();
    expect(options.fetchOptions).toBeUndefined();
    expect(options.baseURL).toBeUndefined();
  });

  it("passes OPENAI_BASE_URL to the SDK when configured", () => {
    const options = getOpenAIClientOptions("test-api-key", {
      OPENAI_BASE_URL: "https://api.zhizengzeng.com/v1",
    });

    expect(options.baseURL).toBe("https://api.zhizengzeng.com/v1");
  });

  it("creates an OpenAI client without a proxy or a network call", () => {
    process.env.OPENAI_API_KEY = "test-api-key";
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;

    expect(getOpenAIClient()).toBeDefined();
  });

  it("logs only base URL configuration state and the effective hostname", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    process.env.OPENAI_API_KEY = "test-api-key";
    process.env.OPENAI_BASE_URL = "https://api.zhizengzeng.com/v1";

    const client = getOpenAIClient();

    expect(new URL(client.baseURL).hostname).toBe("api.zhizengzeng.com");
    expect(info).toHaveBeenCalledWith(
      "[PriceAI][OpenAI] OPENAI_BASE_URL configured: true; baseURL host: api.zhizengzeng.com",
    );
  });

  it("uses HTTPS_PROXY with Undici fetch and ProxyAgent", async () => {
    const options = getOpenAIClientOptions("test-api-key", {
      HTTPS_PROXY: "http://127.0.0.1:7890",
      HTTP_PROXY: "http://unused-proxy:8080",
    });

    expect(resolveOpenAIProxyUrl({ HTTPS_PROXY: "https://proxy.example" })).toBe("https://proxy.example");
    expect(options.fetch).toBe(undiciFetch);
    expect(options.fetchOptions?.dispatcher).toBeInstanceOf(ProxyAgent);

    await (options.fetchOptions?.dispatcher as ProxyAgent).close();
  });
});
