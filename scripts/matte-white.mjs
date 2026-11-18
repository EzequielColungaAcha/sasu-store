/**
 * Clears flat studio white from pack shots and tightens nutrition tables.
 *
 * Near-white is every channel at or above 252. A table is more than 75%
 * near-white and under 2% chromatic color: it is cropped to the printed
 * content plus 32 pixels, and the white inside that crop stays. Other photos
 * with an opaque white corner lose near-white pixels outside the package.
 * White on the package stays, because it sits inside the span of the darker
 * print. A table that is already within a few pixels of that pad is left
 * alone, so a later run does not clear its white. Transparent corners are left alone.
 *
 *   npm run matte
 */
import { readdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const WHITE = 252;
const PAD = 32;
const TABLE_WHITE = 0.75;
const TABLE_CHROMA = 0.02;
const CHROMA_SPREAD = 24;

function isNearWhite(r, g, b) {
  return r >= WHITE && g >= WHITE && b >= WHITE;
}

function opaqueWhiteCorners(data, width, height) {
  const inset = Math.min(2, width - 1, height - 1);
  const points = [
    [inset, inset],
    [width - 1 - inset, inset],
    [inset, height - 1 - inset],
    [width - 1 - inset, height - 1 - inset],
  ];
  let hits = 0;
  for (const [x, y] of points) {
    const i = (y * width + x) * 4;
    if (data[i + 3] > 16 && isNearWhite(data[i], data[i + 1], data[i + 2])) hits += 1;
  }
  return hits >= 3;
}

function coverage(data, width, height) {
  const total = width * height;
  let near = 0;
  let chroma = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isNearWhite(r, g, b)) near += 1;
    else if (Math.max(r, g, b) - Math.min(r, g, b) > CHROMA_SPREAD) chroma += 1;
  }
  return { near: near / total, chroma: chroma / total };
}

function contentBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      if (isNearWhite(data[i], data[i + 1], data[i + 2])) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function contentCrop(data, width, height) {
  const bounds = contentBounds(data, width, height);
  if (!bounds) return null;
  const left = Math.max(0, bounds.minX - PAD);
  const top = Math.max(0, bounds.minY - PAD);
  const right = Math.min(width - 1, bounds.maxX + PAD);
  const bottom = Math.min(height - 1, bounds.maxY + PAD);
  const removed = Math.max(left, top, width - 1 - right, height - 1 - bottom);
  if (removed < 8) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function alreadyPadded(data, width, height) {
  const bounds = contentBounds(data, width, height);
  if (!bounds) return true;
  const limit = PAD + 24;
  return (
    bounds.minX <= limit &&
    bounds.minY <= limit &&
    width - 1 - bounds.maxX <= limit &&
    height - 1 - bounds.maxY <= limit
  );
}

function clearStudioWhite(data, width, height) {
  const inkAt = (i) => data[i + 3] > 16 && Math.min(data[i], data[i + 1], data[i + 2]) <= 250;
  const rowMin = new Int32Array(height).fill(-1);
  const rowMax = new Int32Array(height).fill(-1);
  const colMin = new Int32Array(width).fill(-1);
  const colMax = new Int32Array(width).fill(-1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!inkAt(i)) continue;
      if (rowMin[y] < 0) rowMin[y] = x;
      rowMax[y] = x;
      if (colMin[x] < 0) colMin[x] = y;
      colMax[x] = y;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      if (!isNearWhite(data[i], data[i + 1], data[i + 2])) continue;
      const inRow = rowMin[y] >= 0 && x >= rowMin[y] && x <= rowMax[y];
      const inCol = colMin[x] >= 0 && y >= colMin[x] && y <= colMax[x];
      if (!inRow || !inCol) data[i + 3] = 0;
    }
  }
}

/**
 * @param {Buffer} input An already-oriented raster.
 * @returns {Promise<{ buffer: Buffer, changed: boolean, action: "skip" | "crop" | "knock" }>}
 */
export async function matteWhite(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (!opaqueWhiteCorners(data, width, height)) {
    return { buffer: input, changed: false, action: "skip" };
  }

  const { near, chroma } = coverage(data, width, height);
  if (chroma < TABLE_CHROMA && near > TABLE_WHITE) {
    const extract = contentCrop(data, width, height);
    if (!extract) return { buffer: input, changed: false, action: "skip" };
    const buffer = await sharp(input).extract(extract).toBuffer();
    return { buffer, changed: true, action: "crop" };
  }
  // A cropped table is still black type on white, but the white share drops
  // below 75%. Leave it so a later run does not knock the sheet out.
  if (chroma < TABLE_CHROMA && alreadyPadded(data, width, height)) {
    return { buffer: input, changed: false, action: "skip" };
  }

  clearStudioWhite(data, width, height);
  const buffer = await sharp(data, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
  return { buffer, changed: true, action: "knock" };
}

async function webpFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await webpFiles(full)));
    else if (entry.name.endsWith(".webp")) files.push(full);
  }
  return files;
}

async function main() {
  const root = path.dirname(fileURLToPath(new URL(".", import.meta.url)));
  const imagesRoot = path.join(root, "public/images/products");
  const files = await webpFiles(imagesRoot);
  const counts = { knock: 0, crop: 0, skip: 0 };

  for (const file of files) {
    const rotated = await sharp(file).rotate().toBuffer();
    const { buffer, changed, action } = await matteWhite(rotated);
    if (!changed) {
      counts.skip += 1;
      continue;
    }
    const tmp = `${file}.tmp`;
    await sharp(buffer).webp({ quality: 82 }).toFile(tmp);
    await rename(tmp, file);
    counts[action] += 1;
    process.stdout.write(action === "crop" ? "c" : ".");
  }

  console.log(
    `\nMatte: ${counts.knock} cleared, ${counts.crop} tables cropped, ${counts.skip} unchanged`,
  );
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
