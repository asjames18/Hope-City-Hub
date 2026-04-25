import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BRAND = {
  teal: [0x00, 0x4e, 0x59, 0xff],
  lime: [0xa3, 0xd6, 0x00, 0xff],
};

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      pixels[offset] = BRAND.teal[0];
      pixels[offset + 1] = BRAND.teal[1];
      pixels[offset + 2] = BRAND.teal[2];
      pixels[offset + 3] = BRAND.teal[3];
    }
  }

  const stroke = Math.max(18, Math.round(size * 0.14));
  const gap = Math.max(22, Math.round(size * 0.14));
  const insetX = Math.round(size * 0.23);
  const insetY = Math.round(size * 0.2);
  const leftX = insetX;
  const rightX = size - insetX - stroke;
  const topY = insetY;
  const bottomY = size - insetY;
  const crossY = Math.round((topY + bottomY - stroke) / 2);
  const crossLeft = leftX + stroke;
  const crossRight = rightX;

  for (let y = topY; y < bottomY; y += 1) {
    for (let x = leftX; x < leftX + stroke; x += 1) {
      const offset = (y * size + x) * 4;
      pixels[offset] = BRAND.lime[0];
      pixels[offset + 1] = BRAND.lime[1];
      pixels[offset + 2] = BRAND.lime[2];
      pixels[offset + 3] = BRAND.lime[3];
    }
    for (let x = rightX; x < rightX + stroke; x += 1) {
      const offset = (y * size + x) * 4;
      pixels[offset] = BRAND.lime[0];
      pixels[offset + 1] = BRAND.lime[1];
      pixels[offset + 2] = BRAND.lime[2];
      pixels[offset + 3] = BRAND.lime[3];
    }
  }

  for (let y = crossY; y < crossY + stroke; y += 1) {
    for (let x = crossLeft - gap / 4; x < crossRight + gap / 4; x += 1) {
      const offset = (y * size + x) * 4;
      pixels[offset] = BRAND.lime[0];
      pixels[offset + 1] = BRAND.lime[1];
      pixels[offset + 2] = BRAND.lime[2];
      pixels[offset + 3] = BRAND.lime[3];
    }
  }

  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    rows[rowOffset] = 0;
    pixels.copy(rows, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outputs = [
  ['public/pwa-192x192.png', 192],
  ['public/pwa-512x512.png', 512],
  ['public/apple-touch-icon.png', 180],
];

for (const [target, size] of outputs) {
  writeFileSync(resolve(target), createIcon(size));
}
