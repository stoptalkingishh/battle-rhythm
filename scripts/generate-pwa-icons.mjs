#!/usr/bin/env node
/**
 * Draw the Battle Rhythm PWA icons and write them to assets/icons/.
 *
 * Why this exists: the web app manifest (issue #5) needs real raster icons.
 * The repository has no build step and no image toolchain, and the brand mark
 * that index.html already ships as an inline data: URI is a five-element SVG
 * (rounded dark plate + four gold bars). Rather than add a dependency, this
 * rasterises exactly that geometry to PNG with nothing but node:zlib.
 *
 * The PNGs are committed. A fresh clone is deployable without running this —
 * same rule as the plates. Re-run only when the brand mark changes:
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 * Encoding notes, since the format is hand-rolled:
 *   - 8-bit RGBA, colour type 6, no interlacing.
 *   - Each scanline is prefixed with filter byte 0 (None), so the raw stream
 *     handed to deflate is height * (1 + 4 * width) bytes.
 *   - IDAT is a zlib stream, which is what `deflateSync` produces by default.
 *   - Chunk CRCs are CRC-32 over type + data, as the spec requires.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets', 'icons');

/* The brand mark, in 32x32 units — identical to the inline SVG in index.html. */
const PLATE = '#0B0C0F';
const BAR = '#D4A644';
const BARS = [
  { x: 5, y: 20, w: 4, h: 6 },
  { x: 11, y: 14, w: 4, h: 12 },
  { x: 17, y: 12, w: 4, h: 14 },
  { x: 23, y: 16, w: 4, h: 10 },
];
const PLATE_RADIUS = 7;

function parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Signed-distance coverage of a rounded rectangle, sampled 4x4 per pixel.
 * Cheap, and good enough that the corners are not visibly stepped at 512px.
 */
function roundedRectCoverage(px, py, x, y, w, h, r) {
  let hits = 0;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const cx = px + (sx + 0.5) / 4;
      const cy = py + (sy + 0.5) / 4;
      const dx = Math.max(x + r - cx, 0, cx - (x + w - r));
      const dy = Math.max(y + r - cy, 0, cy - (y + h - r));
      const inside = cx >= x && cx <= x + w && cy >= y && cy <= y + h && Math.hypot(dx, dy) <= r;
      if (inside) hits++;
    }
  }
  return hits / 16;
}

/** Paint one icon at `size` px. `inset` shrinks the mark for maskable icons. */
function render(size, inset) {
  const scale = size / 32;
  const rgba = Buffer.alloc(size * size * 4);
  const plate = parseHex(PLATE);
  const bar = parseHex(BAR);

  const shape = (u) => u * scale;
  const markW = shape(32 - 2 * inset);
  const markX = shape(inset);
  const radius = shape(PLATE_RADIUS) * (markW / shape(32));

  // Bars are expressed in the inner mark's own coordinate space so that an
  // inset icon shrinks every element, not just the plate.
  const inner = 32 - 2 * inset;
  const toX = (u) => markX + shape(((u - inset) / inner) * inner);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const plateA = roundedRectCoverage(x + 0.5, y + 0.5, markX, markX, markW, markW, radius);
      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) rgba[offset + c] = plate[c];
      rgba[offset + 3] = Math.round(plateA * 255);

      for (const b of BARS) {
        const bx = toX(b.x);
        const by = toX(b.y);
        const bw = (b.w / inner) * markW;
        const bh = (b.h / inner) * markW;
        const a = roundedRectCoverage(x + 0.5, y + 0.5, bx, by, bw, bh, Math.min(bw, bh) / 2);
        if (a <= 0) continue;
        const alpha = a * (plateA);
        for (let c = 0; c < 3; c++) {
          rgba[offset + c] = Math.round(bar[c] * alpha + rgba[offset + c] * (1 - alpha));
        }
        rgba[offset + 3] = Math.max(rgba[offset + 3], Math.round(alpha * 255));
      }
    }
  }
  return rgba;
}

/* ---- minimal PNG container ---- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 2 },
  { file: 'icon-512.png', size: 512, inset: 2 },
  // Maskable icons get cropped to a circle by Android, so the mark is inset
  // far enough that no bar reaches the safe-zone edge.
  { file: 'icon-maskable-512.png', size: 512, inset: 6 },
];

fs.mkdirSync(outDir, { recursive: true });
for (const target of TARGETS) {
  const png = encodePng(target.size, render(target.size, target.inset));
  fs.writeFileSync(path.join(outDir, target.file), png);
  console.log(`wrote assets/icons/${target.file} (${target.size}x${target.size}, ${png.length} bytes)`);
}
