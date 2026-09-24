import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';

// Rasterize the same simple moon geometry as icon.svg; no external assets.
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
for (const [size, name] of [
  [192, 'icon-192'],
  [512, 'icon-512'],
  [180, 'apple-touch-icon'],
] as const) {
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  const background = [24, 61, 58];
  const foreground = [228, 239, 202];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let coverage = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) / size) * 512;
          const py = ((y + (sy + 0.5) / 4) / size) * 512;
          const circle = Math.hypot(px - 254, py - 262) < 137;
          const cutout = Math.hypot(px - 325, py - 198) < 125;
          if ((circle && !cutout) || Math.hypot(px - 367, py - 146) < 13) coverage++;
        }
      for (let c = 0; c < 3; c++)
        pixels[y * (size * 3 + 1) + 1 + x * 3 + c] = Math.round(
          background[c] + ((foreground[c] - background[c]) * coverage) / 16,
        );
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  await writeFile(
    `public/${name}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
