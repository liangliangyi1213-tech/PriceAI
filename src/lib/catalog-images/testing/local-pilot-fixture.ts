// Test-only: never imported by an application entry point.
import { deflateSync } from "node:zlib";

export function isLocalPilotEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.PRICEAI_LOCAL_MIRROR_PILOT === "1"
    && /^PriceAIPilot[a-f0-9]{16}$/.test(env.PRICEAI_LOCAL_MIRROR_PILOT_PROJECT ?? "")
    && env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:55421";
}

export function ownedPilotPng(): Buffer {
  function chunk(kind: string, data: Buffer): Buffer {
    const payload = Buffer.concat([Buffer.from(kind), data]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, payload, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(10, 0);
  header.writeUInt32BE(20, 4);
  header[8] = 8;
  header[9] = 2; // 8-bit RGB, no interlace.
  const pixels = Buffer.alloc(20 * 31, 180);
  for (let row = 0; row < 20; row++) pixels[row * 31] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
