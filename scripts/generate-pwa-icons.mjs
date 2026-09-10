import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function writePng(file, size, sample) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = sample(x, y, size);
      const o = row + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

function draw(x, y, size, pad = 0.08) {
  const nx = (x + 0.5) / size;
  const ny = (y + 0.5) / size;
  const r = 0.22;
  const inRound = roundedRect(nx, ny, r);

  if (!inRound) return [0, 0, 0, 0];

  const bg = [15, 23, 42, 255];
  const cx = 0.5;
  const top = 0.16 + pad * 0.2;
  const bot = 0.84;
  const left = 0.2;
  const right = 0.8;

  const inTriangle = pointInTri(nx, ny, cx, top, left, bot, right, bot);
  if (!inTriangle) return bg;

  const t = Math.min(1, Math.max(0, (nx + ny) / 2));
  const rC = Math.round(37 + (16 - 37) * t);
  const gC = Math.round(99 + (185 - 99) * t);
  const bC = Math.round(235 + (129 - 235) * t);
  return [rC, gC, bC, 255];
}

function roundedRect(nx, ny, radius) {
  const x = Math.min(nx, 1 - nx);
  const y = Math.min(ny, 1 - ny);
  if (x >= radius || y >= radius) return nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1;
  const dx = radius - x;
  const dy = radius - y;
  return dx * dx + dy * dy <= radius * radius;
}

function pointInTri(px, py, x1, y1, x2, y2, x3, y3) {
  const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  const a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / d;
  const b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / d;
  const c = 1 - a - b;
  return a >= 0 && b >= 0 && c >= 0;
}

fs.mkdirSync(outDir, { recursive: true });
writePng(path.join(outDir, 'pwa-192.png'), 192, (x, y, s) => draw(x, y, s));
writePng(path.join(outDir, 'pwa-512.png'), 512, (x, y, s) => draw(x, y, s));
writePng(path.join(outDir, 'pwa-512-maskable.png'), 512, (x, y, s) => {
  const [r, g, b, a] = draw(x, y, s, 0.18);
  if (a === 0) return [15, 23, 42, 255];
  return [r, g, b, a];
});
writePng(path.join(outDir, 'apple-touch-icon.png'), 180, (x, y, s) => {
  const [r, g, b, a] = draw(x, y, s, 0.12);
  if (a === 0) return [15, 23, 42, 255];
  return [r, g, b, a];
});
console.log('Wrote PWA icons to public/icons');
