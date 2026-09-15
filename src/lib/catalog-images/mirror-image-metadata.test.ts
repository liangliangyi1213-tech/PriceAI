import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { inspectMirrorImage } from "./mirror-image-metadata";

const limits = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  maxDecodedPixels: 40_000_000,
};

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function webpChunk(kind: "VP8 " | "VP8L" | "VP8X", payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(20 + payload.length);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(bytes.buffer).setUint32(4, 12 + payload.length, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([...kind].map((char) => char.charCodeAt(0)), 12);
  new DataView(bytes.buffer).setUint32(16, payload.length, true);
  bytes.set(payload, 20);
  return bytes;
}

function vp8(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  payload.set([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a]);
  new DataView(payload.buffer).setUint16(6, width, true);
  new DataView(payload.buffer).setUint16(8, height, true);
  return webpChunk("VP8 ", payload);
}

function vp8l(width: number, height: number): Uint8Array {
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  const payload = Uint8Array.from([
    0x2f,
    widthMinusOne & 0xff,
    ((widthMinusOne >>> 8) & 0x3f) | ((heightMinusOne & 0x03) << 6),
    (heightMinusOne >>> 2) & 0xff,
    (heightMinusOne >>> 10) & 0x0f,
  ]);
  return webpChunk("VP8L", payload);
}

function vp8x(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  payload.set([widthMinusOne & 0xff, (widthMinusOne >>> 8) & 0xff, (widthMinusOne >>> 16) & 0xff], 4);
  payload.set([heightMinusOne & 0xff, (heightMinusOne >>> 8) & 0xff, (heightMinusOne >>> 16) & 0xff], 7);
  return webpChunk("VP8X", payload);
}

describe("Catalog mirror image inspection", () => {
  it.each([
    ["image/jpeg", jpeg(1200, 800), 1200, 800, "jpg"],
    ["image/png", png(640, 480), 640, 480, "png"],
    ["image/webp", vp8(800, 600), 800, 600, "webp"],
    ["image/webp", vp8l(321, 123), 321, 123, "webp"],
    ["image/webp", vp8x(1920, 1080), 1920, 1080, "webp"],
  ] as const)("recognizes %s dimensions and a stable binary hash", (contentType, bytes, width, height, extension) => {
    expect(inspectMirrorImage(bytes, contentType, limits)).toEqual({
      bytes,
      contentType,
      width,
      height,
      extension,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    });
  });

  it("rejects WebP when its VP8 dimensions cannot be parsed", () => {
    expect(() => inspectMirrorImage(webpChunk("VP8 ", new Uint8Array(10)), "image/webp", limits))
      .toThrow(expect.objectContaining({ code: "invalid_dimensions" }));
  });

  it("rejects a WebP dimensions chunk whose declared length is too short", () => {
    const bytes = vp8x(100, 100);
    new DataView(bytes.buffer).setUint32(16, 1, true);
    expect(() => inspectMirrorImage(bytes, "image/webp", limits))
      .toThrow(expect.objectContaining({ code: "invalid_dimensions" }));
  });

  it("rejects a PNG whose first chunk is not a valid IHDR", () => {
    const bytes = png(100, 100);
    bytes[11] = 0x01;
    expect(() => inspectMirrorImage(bytes, "image/png", limits))
      .toThrow(expect.objectContaining({ code: "invalid_dimensions" }));
  });

  it.each([
    ["image/jpeg", png(10, 10), "magic_mismatch"],
    ["image/jpeg", new TextEncoder().encode("<html>not an image</html>"), "magic_mismatch"],
    ["image/svg+xml", new TextEncoder().encode("<svg></svg>"), "unsupported_mime"],
    ["image/gif", Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "unsupported_mime"],
  ] as const)("rejects spoofed or unsupported content (%s)", (contentType, bytes, code) => {
    expect(() => inspectMirrorImage(bytes, contentType, limits))
      .toThrow(expect.objectContaining({ code }));
  });

  it("rejects invalid dimensions and decoded pixel bombs", () => {
    expect(() => inspectMirrorImage(png(0, 10), "image/png", limits))
      .toThrow(expect.objectContaining({ code: "invalid_dimensions" }));
    expect(() => inspectMirrorImage(png(10_000, 10_000), "image/png", limits))
      .toThrow(expect.objectContaining({ code: "pixel_limit_exceeded" }));
  });
});
