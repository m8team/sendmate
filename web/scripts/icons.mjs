/**
 * Regenerates every icon from public/favicon.svg, so the tab, the home screen and the
 * PWA manifest all show the same mark. Run with `npm run icons` after changing the SVG.
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("public/favicon.svg");
/** iOS and Android mask the corners themselves, so those icons are full bleed. */
const square = Buffer.from(svg.toString().replace(' rx="7"', ""));

const png = (source, size) => sharp(source).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** An .ico is a small header plus, here, whole PNGs: the format every browser still accepts. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  for (const [i, { size, data }] of images.entries()) {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry); // 0 means 256
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  }
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const files = [
  ["public/favicon-16x16.png", await png(svg, 16)],
  ["public/favicon-32x32.png", await png(svg, 32)],
  ["public/apple-touch-icon.png", await png(square, 180)],
  ["public/icon-192.png", await png(square, 192)],
  ["public/icon-512.png", await png(square, 512)],
  ["public/favicon.ico", ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(svg, size) }))))],
];

for (const [path, data] of files) {
  writeFileSync(path, data);
  console.log(`${path} ${(data.length / 1024).toFixed(1)}KB`);
}
