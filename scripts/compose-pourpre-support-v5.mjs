import sharp from "sharp";

const SOURCE =
  "public/images/client/raw/product-card-pourpre.webp";
const COLOR_BASE =
  "public/images/client/apollon-world/apollon-pourpre-model-color-v4.webp";
const OUTPUT =
  "public/images/client/apollon-world/apollon-pourpre-model-color-v5.webp";

const { data: source, info } = await sharp(SOURCE)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const pixelCount = info.width * info.height;
const connectedSupport = Buffer.alloc(pixelCount);
const queued = new Uint8Array(pixelCount);
const queue = new Int32Array(pixelCount);
let queueStart = 0;
let queueEnd = 0;

function isSupportCandidate(offset) {
  const sourceOffset = offset * info.channels;
  const red = source[sourceOffset];
  const green = source[sourceOffset + 1];
  const blue = source[sourceOffset + 2];
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const blueCast = blue - (red + green) / 2;

  // The draped pedestal is neutral near-black. The studio wall becomes dark
  // near the floor too, but retains a distinct blue cast, so it is excluded.
  return luminance < 58 && (blueCast < 9.5 || luminance < 16);
}

function enqueue(x, y) {
  if (x < 0 || x >= 650 || y < 1800 || y >= info.height) return;
  const offset = y * info.width + x;
  if (queued[offset] || !isSupportCandidate(offset)) return;
  queued[offset] = 1;
  queue[queueEnd] = offset;
  queueEnd += 1;
}

// Flood-fill from several known black-fabric seeds at the lower-left. This
// keeps the source pedestal's real rounded/draped silhouette instead of
// approximating it with a polygon, while excluding the disconnected wall.
for (const [x, y] of [
  [8, 2590],
  [120, 2500],
  [300, 2500],
  [480, 2500],
]) {
  enqueue(x, y);
}

while (queueStart < queueEnd) {
  const offset = queue[queueStart];
  queueStart += 1;
  connectedSupport[offset] = 255;

  const x = offset % info.width;
  const y = Math.floor(offset / info.width);
  enqueue(x - 1, y);
  enqueue(x + 1, y);
  enqueue(x, y - 1);
  enqueue(x, y + 1);
}

// Restore the cloth's brighter folds inside the connected silhouette. The
// first/last connected pixel on each scanline comes from the real source
// contour; filling only between them removes burgundy pinholes without
// inventing a geometric outer edge.
const filledSupport = Buffer.from(connectedSupport);
for (let y = 1970; y < info.height; y += 1) {
  let first = -1;
  let last = -1;
  let count = 0;
  for (let x = 0; x < 650; x += 1) {
    const offset = y * info.width + x;
    if (connectedSupport[offset] === 0) continue;
    if (first === -1) first = x;
    last = x;
    count += 1;
  }
  if (count < 4) continue;
  filledSupport.fill(255, y * info.width + first, y * info.width + last + 1);
}

const alpha = await sharp(filledSupport, {
  raw: { width: info.width, height: info.height, channels: 1 },
})
  .dilate(3)
  .erode(3)
  .blur(1.15)
  .extractChannel(0)
  .raw()
  .toBuffer();

const supportLayer = await sharp(source, {
  raw: {
    width: info.width,
    height: info.height,
    channels: info.channels,
  },
})
  .joinChannel(alpha, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 1,
    },
  })
  .png()
  .toBuffer();

await sharp(COLOR_BASE)
  .composite([{ input: supportLayer, blend: "over" }])
  .webp({ quality: 92, effort: 6, smartSubsample: true })
  .toFile(OUTPUT);

await Promise.all(
  [360, 720, 1080].map((width) =>
    sharp(OUTPUT)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 88, effort: 6, smartSubsample: true })
      .toFile(OUTPUT.replace(/\.webp$/, `-${width}.webp`)),
  ),
);

const detail = "public/images/client/raw/product-pourpre-detail.webp";
await Promise.all(
  [480, 960].map((width) =>
    sharp(detail)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 88, effort: 6, smartSubsample: true })
      .toFile(detail.replace(/\.webp$/, `-${width}.webp`)),
  ),
);

console.log(
  JSON.stringify(
    {
      master: OUTPUT,
      masterDimensions: `${info.width}x${info.height}`,
      connectedSupportPixels: queueEnd,
      responsive: [360, 720, 1080],
      productCardResponsive: [480, 960],
    },
    null,
    2,
  ),
);
