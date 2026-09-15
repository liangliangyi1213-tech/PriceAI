import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPinnedLookup, downloadMirrorSource, type MirrorHttpResponse } from "./mirror-downloader";
import { CatalogImageMirrorError } from "./mirror-service-types";

const policy = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  maxDownloadBytes: 16,
  maxDecodedPixels: 40_000_000,
};

function response(overrides: Partial<MirrorHttpResponse> = {}): MirrorHttpResponse {
  return {
    statusCode: 200,
    headers: { "content-type": "image/png", "content-length": "4" },
    body: (async function* () { yield Uint8Array.from([1, 2, 3, 4]); })(),
    ...overrides,
  };
}

describe("Catalog mirror downloader", () => {
  it("makes the connector lookup return the validated address instead of resolving the hostname again", async () => {
    const lookup = createPinnedLookup({ address: "93.184.216.34", family: 4 });
    await new Promise<void>((resolve, reject) => {
      lookup("changed.example", {}, (error, address, family) => {
        if (error) { reject(error); return; }
        expect(address).toBe("93.184.216.34");
        expect(family).toBe(4);
        resolve();
      });
    });
  });

  it("returns only the pinned address when Node requests all socket candidates", async () => {
    const lookup = createPinnedLookup({ address: "2606:4700:4700::1111", family: 6 });
    await new Promise<void>((resolve, reject) => {
      lookup("changed.example", { all: true }, (error, addresses) => {
        if (error) { reject(error); return; }
        expect(addresses).toEqual([{ address: "2606:4700:4700::1111", family: 6 }]);
        resolve();
      });
    });
  });

  it("pins the actual request socket to the already validated public DNS address", async () => {
    const resolve = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 as const }]);
    const requestHop = vi.fn(async ({ pinnedAddress }: { pinnedAddress: { address: string; family: 4 | 6 } }) => {
      expect(pinnedAddress).toEqual({ address: "93.184.216.34", family: 4 });
      return response();
    });

    await downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, { resolve, requestHop });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(requestHop).toHaveBeenCalledTimes(1);
  });

  it.each([
    "http://img.alicdn.com/a.png",
    "https://localhost/a.png",
  ])("rejects unsafe source URL %s", async (url) => {
    const requestHop = vi.fn();
    await expect(downloadMirrorSource({ url, platform: "taobao", policy }, {
      resolve: vi.fn(), requestHop,
    })).rejects.toBeInstanceOf(CatalogImageMirrorError);
    expect(requestHop).not.toHaveBeenCalled();
  });

  it("rejects an allowlisted hostname that resolves to a private address", async () => {
    const requestHop = vi.fn();
    await expect(downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, {
      resolve: vi.fn().mockResolvedValue([{ address: "10.0.0.7", family: 4 }]), requestHop,
    })).rejects.toMatchObject({ code: "dns_blocked" });
    expect(requestHop).not.toHaveBeenCalled();
  });

  it.each([
    ["127.0.0.1", 4], ["192.0.2.10", 4], ["::1", 6], ["fd00::1", 6],
    ["fe80::1", 6], ["2001:db8::1", 6], ["::ffff:10.0.0.1", 6],
  ] as const)("blocks loopback, private, link-local, or reserved DNS address %s", async (address, family) => {
    await expect(downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, {
      resolve: vi.fn().mockResolvedValue([{ address, family }]), requestHop: vi.fn(),
    })).rejects.toMatchObject({ code: "dns_blocked" });
  });

  it("allows a public IPv6 address to be pinned", async () => {
    const requestHop = vi.fn().mockResolvedValue(response());
    await downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, {
      resolve: vi.fn().mockResolvedValue([{ address: "2606:4700:4700::1111", family: 6 }]), requestHop,
    });
    expect(requestHop).toHaveBeenCalledWith(expect.objectContaining({
      pinnedAddress: { address: "2606:4700:4700::1111", family: 6 },
    }));
  });

  it("revalidates redirects and blocks a redirect to a private address", async () => {
    const requestHop = vi.fn().mockResolvedValue(response({
      statusCode: 302,
      headers: { location: "https://127.0.0.1/private.png" },
    }));
    await expect(downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, {
      resolve: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]), requestHop,
    })).rejects.toMatchObject({ code: "redirect_blocked" });
    expect(requestHop).toHaveBeenCalledTimes(1);
  });

  it("maps an allowlisted redirect hostname resolving privately to redirect_blocked", async () => {
    const resolve = vi.fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.8", family: 4 }]);
    const requestHop = vi.fn().mockResolvedValue(response({
      statusCode: 302, headers: { location: "https://gw.alicdn.com/redirect.png" },
    }));
    await expect(downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, {
      resolve, requestHop,
    })).rejects.toMatchObject({ code: "redirect_blocked" });
    expect(requestHop).toHaveBeenCalledTimes(1);
  });

  it("rejects redirects beyond the configured bound", async () => {
    const requestHop = vi.fn().mockImplementation(async ({ url }: { url: URL }) => response({
      statusCode: 302,
      headers: { location: `https://img.alicdn.com${url.pathname}x` },
    }));
    await expect(downloadMirrorSource({ url: "https://img.alicdn.com/a", platform: "taobao", policy }, {
      resolve: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]), requestHop, maxRedirects: 2,
    })).rejects.toMatchObject({ code: "redirect_blocked" });
    expect(requestHop).toHaveBeenCalledTimes(3);
  });

  it("rejects Content-Length before consuming the response body", async () => {
    const body = { [Symbol.asyncIterator]: vi.fn() } as unknown as AsyncIterable<Uint8Array>;
    await expect(downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, {
      resolve: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      requestHop: vi.fn().mockResolvedValue(response({ headers: { "content-type": "image/png", "content-length": "17" }, body })),
    })).rejects.toMatchObject({ code: "response_too_large" });
    expect(body[Symbol.asyncIterator]).not.toHaveBeenCalled();
  });

  it("aborts a chunked response once accumulated bytes exceed the policy", async () => {
    const body = (async function* () {
      yield new Uint8Array(10);
      yield new Uint8Array(7);
    })();
    await expect(downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, {
      resolve: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      requestHop: vi.fn().mockResolvedValue(response({ headers: { "content-type": "image/png" }, body })),
    })).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("maps transport aborts to a stable timeout without leaking transport details", async () => {
    await expect(downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, {
      resolve: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      requestHop: vi.fn().mockRejectedValue(Object.assign(new Error("secret URL"), { name: "AbortError" })),
    })).rejects.toEqual(new CatalogImageMirrorError("timeout"));
  });

  it("applies the total timeout while DNS resolution is still pending", async () => {
    await expect(downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, {
      timeoutMs: 2,
      resolve: vi.fn().mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve([{ address: "93.184.216.34", family: 4 }]), 20);
      })),
      requestHop: vi.fn().mockResolvedValue(response()),
    })).rejects.toEqual(new CatalogImageMirrorError("timeout"));
  });

  it("applies the total timeout while a response body is still streaming", async () => {
    const body = (async function* () {
      await new Promise((resolve) => setTimeout(resolve, 20));
      yield Uint8Array.from([1, 2, 3]);
    })();
    await expect(downloadMirrorSource({ url: "https://img.alicdn.com/a.png", platform: "taobao", policy }, {
      timeoutMs: 2,
      resolve: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      requestHop: vi.fn().mockResolvedValue(response({ headers: { "content-type": "image/png" }, body })),
    })).rejects.toEqual(new CatalogImageMirrorError("timeout"));
  });
});
