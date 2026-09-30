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

function writePng(file, width, height, sample) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = sample(x, y, width, height);
      const o = row + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
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

function drawMark(x, y, size, pad = 0.08) {
  const nx = (x + 0.5) / size;
  const ny = (y + 0.5) / size;
  const r = 0.22;
  if (!roundedRect(nx, ny, r)) return [0, 0, 0, 0];

  const bg = [15, 23, 42, 255];
  const cx = 0.5;
  const top = 0.16 + pad * 0.2;
  const bot = 0.84;
  const left = 0.2;
  const right = 0.8;
  if (!pointInTri(nx, ny, cx, top, left, bot, right, bot)) return bg;

  const t = Math.min(1, Math.max(0, (nx + ny) / 2));
  return [
    Math.round(37 + (16 - 37) * t),
    Math.round(99 + (185 - 99) * t),
    Math.round(235 + (129 - 235) * t),
    255,
  ];
}

function splashSample(x, y, width, height) {
  const bg = [15, 23, 42, 255];
  const logo = Math.round(Math.min(width, height) * 0.26);
  const ox = Math.round((width - logo) / 2);
  const oy = Math.round((height - logo) / 2) - Math.round(height * 0.03);
  if (x < ox || y < oy || x >= ox + logo || y >= oy + logo) return bg;
  const pixel = drawMark(x - ox, y - oy, logo, 0.1);
  if (pixel[3] === 0) return bg;
  return pixel;
}

fs.mkdirSync(outDir, { recursive: true });

writePng(path.join(outDir, 'pwa-192.png'), 192, 192, (x, y, w) => drawMark(x, y, w));
writePng(path.join(outDir, 'pwa-512.png'), 512, 512, (x, y, w) => drawMark(x, y, w));
writePng(path.join(outDir, 'pwa-512-maskable.png'), 512, 512, (x, y, w) => {
  const [r, g, b, a] = drawMark(x, y, w, 0.18);
  return a === 0 ? [15, 23, 42, 255] : [r, g, b, a];
});

for (const size of [120, 152, 167, 180]) {
  writePng(path.join(outDir, `apple-touch-icon-${size}.png`), size, size, (x, y, w) => {
    const [r, g, b, a] = drawMark(x, y, w, 0.12);
    return a === 0 ? [15, 23, 42, 255] : [r, g, b, a];
  });
}
fs.copyFileSync(path.join(outDir, 'apple-touch-icon-180.png'), path.join(outDir, 'apple-touch-icon.png'));

/** Portrait CSS pixels × pixel-ratio → PNG size. */
const APPLE_SPLASH = [
  { w: 1320, h: 2868, dw: 440, dh: 956, dpr: 3 },
  { w: 1206, h: 2622, dw: 402, dh: 874, dpr: 3 },
  { w: 1290, h: 2796, dw: 430, dh: 932, dpr: 3 },
  { w: 1179, h: 2556, dw: 393, dh: 852, dpr: 3 },
  { w: 1284, h: 2778, dw: 428, dh: 926, dpr: 3 },
  { w: 1170, h: 2532, dw: 390, dh: 844, dpr: 3 },
  { w: 1125, h: 2436, dw: 375, dh: 812, dpr: 3 },
  { w: 1242, h: 2688, dw: 414, dh: 896, dpr: 3 },
  { w: 828, h: 1792, dw: 414, dh: 896, dpr: 2 },
  { w: 1242, h: 2208, dw: 414, dh: 736, dpr: 3 },
  { w: 750, h: 1334, dw: 375, dh: 667, dpr: 2 },
  { w: 640, h: 1136, dw: 320, dh: 568, dpr: 2 },
  { w: 2048, h: 2732, dw: 1024, dh: 1366, dpr: 2 },
  { w: 1668, h: 2388, dw: 834, dh: 1194, dpr: 2 },
  { w: 1640, h: 2360, dw: 820, dh: 1180, dpr: 2 },
  { w: 1536, h: 2048, dw: 768, dh: 1024, dpr: 2 },
];

for (const spec of APPLE_SPLASH) {
  const file = path.join(outDir, `apple-splash-${spec.w}x${spec.h}.png`);
  writePng(file, spec.w, spec.h, splashSample);
}

console.log(`Wrote PWA icons and ${APPLE_SPLASH.length} Apple splash screens to public/icons`);
