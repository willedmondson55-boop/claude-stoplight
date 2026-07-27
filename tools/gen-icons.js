#!/usr/bin/env node
// Generates the extension's stoplight icons as PNGs using only Node built-ins.
// Usage: node tools/gen-icons.js

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'extension', 'icons');
const SIZES = [16, 32, 48, 128];

// ---- minimal PNG encoder (RGBA, 8-bit) ----

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- drawing (4x4 supersampled coverage) ----

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const housing = [0x1f, 0x24, 0x30];
  const lamps = [
    { color: [0xef, 0x44, 0x44], cy: 0.24 }, // red
    { color: [0xea, 0xb3, 0x08], cy: 0.5 }, // yellow
    { color: [0x22, 0xc5, 0x5e], cy: 0.76 }, // green
  ];
  const bodyW = size * 0.56;
  const bodyX0 = (size - bodyW) / 2;
  const bodyX1 = bodyX0 + bodyW;
  const radius = bodyW / 2 * 0.92;
  const lampR = size * 0.115;

  const inRoundRect = (x, y) => {
    if (x < bodyX0 || x > bodyX1 || y < 0.02 * size || y > 0.98 * size) return false;
    const ry = Math.min(radius, size * 0.48);
    const cx = x < bodyX0 + ry ? bodyX0 + ry : x > bodyX1 - ry ? bodyX1 - ry : x;
    const cy = y < 0.02 * size + ry ? 0.02 * size + ry : y > 0.98 * size - ry ? 0.98 * size - ry : y;
    if (cx === x || cy === y) return true;
    return (x - cx) ** 2 + (y - cy) ** 2 <= ry * ry;
  };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bodyCov = 0;
      const lampCov = [0, 0, 0];
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const x = px + (sx + 0.5) / 4;
          const y = py + (sy + 0.5) / 4;
          if (!inRoundRect(x, y)) continue;
          bodyCov++;
          lamps.forEach((lamp, i) => {
            const dx = x - size / 2;
            const dy = y - lamp.cy * size;
            if (dx * dx + dy * dy <= lampR * lampR) lampCov[i]++;
          });
        }
      }
      if (bodyCov === 0) continue;
      let [r, g, b] = housing;
      lamps.forEach((lamp, i) => {
        const t = lampCov[i] / bodyCov;
        r = r * (1 - t) + lamp.color[0] * t;
        g = g * (1 - t) + lamp.color[1] * t;
        b = b * (1 - t) + lamp.color[2] * t;
      });
      const idx = (py * size + px) * 4;
      rgba[idx] = Math.round(r);
      rgba[idx + 1] = Math.round(g);
      rgba[idx + 2] = Math.round(b);
      rgba[idx + 3] = Math.round((bodyCov / 16) * 255);
    }
  }
  return encodePNG(size, size, rgba);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(file, drawIcon(size));
  console.log(`wrote ${file}`);
}
