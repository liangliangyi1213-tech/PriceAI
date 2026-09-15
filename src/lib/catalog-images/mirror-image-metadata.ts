import { createHash } from "node:crypto";

import { CatalogImageMirrorError } from "./mirror-service-types";

export type MirrorContentType = "image/jpeg" | "image/png" | "image/webp";

export type InspectedMirrorImage = Readonly<{
  bytes: Uint8Array;
  contentType: MirrorContentType;
  width: number;
  height: number;
  extension: "jpg" | "png" | "webp";
  contentHash: string;
}>;

type InspectionLimits = Readonly<{
  allowedMimeTypes: readonly string[];
  maxDecodedPixels: number;
}>;

function normalizedContentType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean {
  return prefix.every((value, index) => bytes[offset + index] === value);
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || !hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    || !hasPrefix(bytes, [0x00, 0x00, 0x00, 0x0d], 8)
    || !hasPrefix(bytes, [0x49, 0x48, 0x44, 0x52], 12)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const jpegSofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (jpegSofMarkers.has(marker)) {
      if (length < 7) return null;
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffSize = view.getUint32(4, true);
  const chunkSize = view.getUint32(16, true);
  if (riffSize + 8 > bytes.length || chunkSize + 20 > bytes.length) return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    if (chunkSize < 10 || bytes.length < 30) return null;
    return { width: readUint24LE(bytes, 24) + 1, height: readUint24LE(bytes, 27) + 1 };
  }
  if (chunk === "VP8L") {
    if (chunkSize < 5 || bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + (b2 >>> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  if (chunk === "VP8 ") {
    if (chunkSize < 10 || bytes.length < 30 || !hasPrefix(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

export function inspectMirrorImage(
  bytes: Uint8Array,
  headerContentType: string,
  limits: InspectionLimits,
): InspectedMirrorImage {
  const contentType = normalizedContentType(headerContentType);
  if (!limits.allowedMimeTypes.includes(contentType)
    || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    throw new CatalogImageMirrorError("unsupported_mime");
  }

  const detected = hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ? { contentType: "image/png" as const, extension: "png" as const, dimensions: pngDimensions(bytes) }
    : hasPrefix(bytes, [0xff, 0xd8])
      ? { contentType: "image/jpeg" as const, extension: "jpg" as const, dimensions: jpegDimensions(bytes) }
      : ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP"
        ? { contentType: "image/webp" as const, extension: "webp" as const, dimensions: webpDimensions(bytes) }
        : null;
  if (!detected || detected.contentType !== contentType) throw new CatalogImageMirrorError("magic_mismatch");
  const dimensions = detected.dimensions;
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new CatalogImageMirrorError("invalid_dimensions");
  }
  if (!Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height)
    || dimensions.width * dimensions.height > limits.maxDecodedPixels) {
    throw new CatalogImageMirrorError("pixel_limit_exceeded");
  }
  return {
    bytes,
    contentType: detected.contentType,
    width: dimensions.width,
    height: dimensions.height,
    extension: detected.extension,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
  };
}
