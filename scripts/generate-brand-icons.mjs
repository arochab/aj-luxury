import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const sourcePath = path.join(publicDir, "images", "aj-luxury-logo@2x.webp");

const MASTER_SIZE = 512;
const MONOGRAM_CROP = { left: 56, top: 48, width: 1337, height: 688 };

const backgroundSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${MASTER_SIZE}" height="${MASTER_SIZE}" viewBox="0 0 ${MASTER_SIZE} ${MASTER_SIZE}">
    <defs>
      <radialGradient id="plum" cx="34%" cy="24%" r="88%">
        <stop offset="0" stop-color="#4a2038"/>
        <stop offset="0.48" stop-color="#24131e"/>
        <stop offset="1" stop-color="#0d090c"/>
      </radialGradient>
    </defs>
    <rect width="512" height="512" rx="88" fill="url(#plum)"/>
    <rect x="8" y="8" width="496" height="496" rx="80" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="4"/>
  </svg>
`);

const monogram = await sharp(sourcePath)
  .extract(MONOGRAM_CROP)
  .median(3)
  .resize({ width: 424, height: 218, fit: "fill", kernel: sharp.kernel.lanczos3 })
  .png()
  .toBuffer();

const master = await sharp(backgroundSvg)
  .composite([{ input: monogram, left: 44, top: 147 }])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

await mkdir(publicDir, { recursive: true });
await writeFile(path.join(publicDir, "favicon.png"), master);

const sizes = [32, 48, 96, 180, 192, 512];
const buffers = new Map();

for (const size of sizes) {
  const buffer =
    size === MASTER_SIZE
      ? master
      : await sharp(master)
          .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
          .png({ compressionLevel: 9, adaptiveFiltering: true })
          .toBuffer();

  buffers.set(size, buffer);

  const fileName =
    size === 180
      ? "apple-touch-icon.png"
      : size === 192 || size === 512
        ? `icon-${size}.png`
        : `favicon-${size}x${size}.png`;

  await writeFile(path.join(publicDir, fileName), buffer);
}

function buildIco(entries) {
  const headerSize = 6 + entries.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let offset = headerSize;
  entries.forEach(({ size, data }, index) => {
    const directoryOffset = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, directoryOffset);
    header.writeUInt8(size === 256 ? 0 : size, directoryOffset + 1);
    header.writeUInt8(0, directoryOffset + 2);
    header.writeUInt8(0, directoryOffset + 3);
    header.writeUInt16LE(1, directoryOffset + 4);
    header.writeUInt16LE(32, directoryOffset + 6);
    header.writeUInt32LE(data.length, directoryOffset + 8);
    header.writeUInt32LE(offset, directoryOffset + 12);
    offset += data.length;
  });

  return Buffer.concat([header, ...entries.map(({ data }) => data)]);
}

await writeFile(
  path.join(publicDir, "favicon.ico"),
  buildIco([
    { size: 32, data: buffers.get(32) },
    { size: 48, data: buffers.get(48) },
  ]),
);

