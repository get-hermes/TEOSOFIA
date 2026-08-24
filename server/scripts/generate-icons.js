// scripts/generate-icons.js — Gera os ícones PNG do PWA em Node puro.
// Uso: node scripts/generate-icons.js
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

// ── PNG encoder mínimo ───────────────────────────────────────────
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw scanlines with filter byte 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Desenho do ícone ─────────────────────────────────────────────
// Fundo escuro (#1a1a2e) com um "sol" dourado (#c9a86a) centralizado
// e um anel ao redor (símbolo de sol/roda).
function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [26, 26, 46, 255];       // #1a1a2e
  const gold = [201, 168, 106, 255];  // #c9a86a
  const goldSoft = [230, 201, 138, 255];

  // Fundo
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = bg[3];
  }

  const cx = size / 2, cy = size / 2;
  // Para maskable, o "safe zone" é 80% do centro.
  const safe = maskable ? 0.4 : 0.5;
  const R = size * safe;          // raio do anel externo
  const r = size * (safe * 0.55); // raio do sol central

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;
      // Anel externo (espessura ~6% do size)
      const ringW = size * 0.06;
      if (dist >= R - ringW && dist <= R) {
        px[idx] = gold[0]; px[idx + 1] = gold[1]; px[idx + 2] = gold[2]; px[idx + 3] = gold[3];
      }
      // Sol central
      if (dist <= r) {
        px[idx] = goldSoft[0]; px[idx + 1] = goldSoft[1]; px[idx + 2] = goldSoft[2]; px[idx + 3] = goldSoft[3];
      }
    }
  }
  return px;
}

for (const [name, size, opts] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
]) {
  const png = encodePNG(size, size, drawIcon(size, opts));
  writeFileSync(path.join(OUT, name), png);
  console.log('✓', name, `(${size}x${size}, ${png.length} bytes)`);
}
