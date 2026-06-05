#!/usr/bin/env node
// Generate 8 placeholder avatar PNGs (100x100 solid colors) for the mini-program.
// These are placeholders only; replace with real designs later.

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const COLORS = [
  [255, 107, 107], // 0: 红色
  [78, 205, 196],  // 1: 青色
  [69, 183, 209],  // 2: 蓝色
  [255, 160, 122], // 3: 橙色
  [152, 216, 200], // 4: 绿色
  [247, 220, 111], // 5: 黄色
  [187, 143, 206], // 6: 紫色
  [133, 193, 226], // 7: 天蓝
];

const WIDTH = 100;
const HEIGHT = 100;

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(r, g, b) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(WIDTH, 0);
  ihdrData.writeUInt32BE(HEIGHT, 4);
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type: RGB
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  const ihdr = chunk('IHDR', ihdrData);

  // Each row: 1-byte filter (0=None) + WIDTH * 3 RGB bytes
  const rowSize = 1 + WIDTH * 3;
  const raw = Buffer.alloc(rowSize * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const offset = y * rowSize;
    raw[offset] = 0;
    for (let x = 0; x < WIDTH; x++) {
      const i = offset + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const idat = chunk('IDAT', zlib.deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

const outDir = path.join(__dirname, '..', 'miniprogram', 'images', 'avatars');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

COLORS.forEach(([r, g, b], i) => {
  const buf = makePng(r, g, b);
  const file = path.join(outDir, `avatar-${i}.png`);
  fs.writeFileSync(file, buf);
  console.log(`Created ${file} (${buf.length} bytes)`);
});
