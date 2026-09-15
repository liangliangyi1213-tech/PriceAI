import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";

import { Agent, request } from "undici";

import { selectProviderImageSource, type LiveImagePlatform } from "@/lib/images/live-listing-image";

import { asMirrorError, CatalogImageMirrorError } from "./mirror-service-types";

export type ResolvedPublicAddress = Readonly<{ address: string; family: 4 | 6 }>;
export type MirrorHttpResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  body: AsyncIterable<Uint8Array> & { destroy?: () => void };
  dispose?: () => Promise<void>;
}>;

export type MirrorRequestHop = (input: Readonly<{
  url: URL;
  pinnedAddress: ResolvedPublicAddress;
  timeoutMs: number;
  signal: AbortSignal;
}>) => Promise<MirrorHttpResponse>;

type MirrorDownloadPolicy = Readonly<{
  allowedMimeTypes: readonly string[];
  maxDownloadBytes: number;
  maxDecodedPixels: number;
}>;

type MirrorDownloaderDependencies = Readonly<{
  resolve?: (hostname: string) => Promise<ResolvedPublicAddress[]>;
  requestHop?: MirrorRequestHop;
  maxRedirects?: number;
  timeoutMs?: number;
}>;

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 32], ["2001:10::", 28], ["2001:20::", 28], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(network, prefix, "ipv6");

function mappedIpv4(address: string): string | null {
  const normalized = address.toLowerCase();
  if (!normalized.startsWith("::ffff:")) return null;
  const tail = normalized.slice(7);
  if (isIP(tail) === 4) return tail;
  const parts = tail.split(":");
  if (parts.length !== 2 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

function isBlockedAddress(address: ResolvedPublicAddress): boolean {
  if (isIP(address.address) !== address.family) return true;
  const mapped = address.family === 6 ? mappedIpv4(address.address) : null;
  return mapped
    ? blocked.check(mapped, "ipv4")
    : blocked.check(address.address, address.family === 4 ? "ipv4" : "ipv6");
}

function provider(platform: string): LiveImagePlatform | null {
  if (platform === "taobao") return "taobao";
  if (platform === "pdd" || platform === "pinduoduo") return "pinduoduo";
  return null;
}

function safeSourceUrl(value: string, platform: string): URL | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || isIP(url.hostname)) return null;
  const livePlatform = provider(platform);
  if (!livePlatform || !selectProviderImageSource(livePlatform, [{ kind: "mirror", url: url.href }])) return null;
  return url;
}

async function defaultResolve(hostname: string): Promise<ResolvedPublicAddress[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.flatMap((record) => record.family === 4 || record.family === 6
    ? [{ address: record.address, family: record.family }]
    : []);
}

export function createPinnedLookup(address: ResolvedPublicAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: address.address, family: address.family }]);
      return;
    }
    callback(null, address.address, address.family);
  };
}

async function defaultRequestHop({ url, pinnedAddress, timeoutMs, signal }: Parameters<MirrorRequestHop>[0]): Promise<MirrorHttpResponse> {
  const dispatcher = new Agent({ connect: { timeout: timeoutMs, lookup: createPinnedLookup(pinnedAddress) } });
  try {
    const result = await request(url, {
      dispatcher,
      method: "GET",
      headers: { accept: "image/jpeg, image/png, image/webp" },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      signal,
    });
    return {
      statusCode: result.statusCode,
      headers: result.headers,
      body: result.body,
      dispose: async () => {
        result.body.destroy();
        await dispatcher.close();
      },
    };
  } catch (error) {
    await dispatcher.close().catch(() => undefined);
    throw error;
  }
}

function header(headers: MirrorHttpResponse["headers"], name: string): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function redirectStatus(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new CatalogImageMirrorError("timeout"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

export async function downloadMirrorSource(
  input: Readonly<{ url: string; platform: string; policy: MirrorDownloadPolicy }>,
  dependencies: MirrorDownloaderDependencies = {},
): Promise<Readonly<{ bytes: Uint8Array; headerContentType: string }>> {
  if (!input.url.startsWith("https://")) throw new CatalogImageMirrorError("invalid_source");
  if (/^https:\/\/(?:localhost|[^/]+\.localhost|\[?(?:127\.|::1))/i.test(input.url)) {
    throw new CatalogImageMirrorError("dns_blocked");
  }
  let current = safeSourceUrl(input.url, input.platform);
  if (!current) throw new CatalogImageMirrorError("invalid_source");
  const resolve = dependencies.resolve ?? defaultResolve;
  const requestHop = dependencies.requestHop ?? defaultRequestHop;
  const maxRedirects = dependencies.maxRedirects ?? 3;
  const timeoutMs = dependencies.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let redirects = 0; ; redirects += 1) {
      let addresses: ResolvedPublicAddress[];
      try { addresses = await withAbort(resolve(current.hostname), controller.signal); }
      catch (error) {
        if (error instanceof CatalogImageMirrorError) throw error;
        throw new CatalogImageMirrorError(redirects > 0 ? "redirect_blocked" : "dns_blocked");
      }
      const pinnedAddress = addresses.find((address) => !isBlockedAddress(address));
      if (!pinnedAddress || addresses.some(isBlockedAddress)) {
        throw new CatalogImageMirrorError(redirects > 0 ? "redirect_blocked" : "dns_blocked");
      }

      let response: MirrorHttpResponse;
      try { response = await requestHop({ url: current, pinnedAddress, timeoutMs, signal: controller.signal }); }
      catch (error) {
        const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
        throw new CatalogImageMirrorError(name === "AbortError" || controller.signal.aborted ? "timeout" : "download_failed");
      }
      try {
        if (redirectStatus(response.statusCode)) {
          if (redirects >= maxRedirects) throw new CatalogImageMirrorError("redirect_blocked");
          const location = header(response.headers, "location");
          if (!location) throw new CatalogImageMirrorError("redirect_blocked");
          let redirectUrl: URL;
          try { redirectUrl = new URL(location, current); }
          catch { throw new CatalogImageMirrorError("redirect_blocked"); }
          if (!redirectUrl.href.startsWith("https://")
            || redirectUrl.hostname === "localhost" || redirectUrl.hostname.endsWith(".localhost")
            || isIP(redirectUrl.hostname)) throw new CatalogImageMirrorError("redirect_blocked");
          current = safeSourceUrl(redirectUrl.href, input.platform) ?? (() => { throw new CatalogImageMirrorError("redirect_blocked"); })();
          continue;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) throw new CatalogImageMirrorError("download_failed");
        const contentLength = header(response.headers, "content-length");
        if (contentLength !== null) {
          const length = Number(contentLength);
          if (!Number.isSafeInteger(length) || length < 0 || length > input.policy.maxDownloadBytes) {
            throw new CatalogImageMirrorError("response_too_large");
          }
        }
        const contentType = header(response.headers, "content-type") ?? "";
        const chunks: Uint8Array[] = [];
        let total = 0;
        for await (const chunk of response.body) {
          if (controller.signal.aborted) throw new CatalogImageMirrorError("timeout");
          total += chunk.byteLength;
          if (total > input.policy.maxDownloadBytes) throw new CatalogImageMirrorError("response_too_large");
          chunks.push(chunk);
        }
        if (controller.signal.aborted) throw new CatalogImageMirrorError("timeout");
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return { bytes, headerContentType: contentType };
      } finally {
        await response.dispose?.();
      }
    }
  } catch (error) {
    throw asMirrorError(error, controller.signal.aborted ? "timeout" : "download_failed");
  } finally {
    clearTimeout(timer);
  }
}
