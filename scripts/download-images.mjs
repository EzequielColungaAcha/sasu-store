/**
 * Downloads remote product images into public/images/products/{slug}/
 * as 01.webp, 02.webp, … and rewrites src/data/products.json.
 *
 * A numbered file is reused only when src/data/image-sources.json records
 * the same CDN pathname for that path. --force re-downloads every remote image.
 *
 *   npm run images
 *   npm run images -- --force
 */
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const force = process.argv.includes("--force");
const root = path.dirname(fileURLToPath(new URL(".", import.meta.url)));
const jsonPath = path.join(root, "src/data/products.json");
const manifestPath = path.join(root, "src/data/image-sources.json");
const imagesRoot = path.join(root, "public/images/products");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function imageKey(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function downloadUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("cdn.shopify.com")) {
      u.searchParams.set("width", "1400");
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchBuffer(url) {
  const res = await fetch(downloadUrl(url), {
    headers: { "User-Agent": "SaSu-catalog/1.0" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function saveWebp(buffer, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await sharp(buffer).rotate().webp({ quality: 82 }).toFile(dest);
}

async function loadManifest() {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    }),
  );
  return out;
}

async function pruneUnlisted(keep) {
  let removed = 0;
  let dirs;
  try {
    dirs = await readdir(imagesRoot, { withFileTypes: true });
  } catch {
    return removed;
  }

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const dirPath = path.join(imagesRoot, dir.name);
    const files = await readdir(dirPath);
    for (const name of files) {
      if (!name.endsWith(".webp")) continue;
      const rel = `/images/products/${dir.name}/${name}`;
      if (keep.has(rel)) continue;
      await rm(path.join(dirPath, name));
      removed += 1;
    }
    const left = await readdir(dirPath);
    if (left.length === 0) await rm(dirPath, { recursive: true });
  }
  return removed;
}

async function main() {
  const catalog = JSON.parse(await readFile(jsonPath, "utf8"));
  const manifest = await loadManifest();
  const jobs = [];

  for (const product of catalog.products) {
    const slug = product.slug || product.id;
    const nextImages = [...product.images];
    product.images = nextImages;
    if (!product.brand) product.brand = "Star Nutrition";

    for (let i = 0; i < nextImages.length; i++) {
      const src = nextImages[i];
      const destRel = `/images/products/${slug}/${pad(i + 1)}.webp`;
      const destAbs = path.join(root, "public", destRel.slice(1));
      jobs.push({ product, index: i, src, destRel, destAbs });
    }
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const localByKey = new Map();

  const remember = (src, dest) => {
    localByKey.set(src, dest);
    localByKey.set(imageKey(src), dest);
  };

  const sawRemote = jobs.some((job) => job.src.startsWith("http"));

  const results = await mapLimit(jobs, 8, async (job) => {
    const { src, destRel, destAbs, product, index } = job;

    if (!src.startsWith("http")) {
      const local = src.startsWith("/") ? src : destRel;
      product.images[index] = local;
      remember(src, local);
      skipped += 1;
      return { status: "local", destRel: local };
    }

    const key = imageKey(src);
    if (!force && manifest[destRel] === key && (await exists(destAbs))) {
      product.images[index] = destRel;
      remember(src, destRel);
      skipped += 1;
      return { status: "skipped", destRel, key };
    }

    try {
      const buf = await fetchBuffer(src);
      await saveWebp(buf, destAbs);
      product.images[index] = destRel;
      remember(src, destRel);
      downloaded += 1;
      process.stdout.write(".");
      return { status: "downloaded", destRel, key };
    } catch (err) {
      failed += 1;
      console.error(`\n${product.name}: ${err.message}`);
      return { status: "failed", destRel };
    }
  });

  for (const product of catalog.products) {
    for (const variant of product.variants || []) {
      if (!variant.image) continue;
      const local = localByKey.get(variant.image) || localByKey.get(imageKey(variant.image));
      if (local) variant.image = local;
    }
  }

  let removed = 0;
  if (sawRemote) {
    const next = {};
    const referenced = new Set();
    for (const result of results) {
      if (result.status === "downloaded" || result.status === "skipped") {
        next[result.destRel] = result.key;
        referenced.add(result.destRel);
      } else if (result.status === "failed" && manifest[result.destRel]) {
        next[result.destRel] = manifest[result.destRel];
      } else if (result.status === "local") {
        referenced.add(result.destRel);
        if (manifest[result.destRel]) next[result.destRel] = manifest[result.destRel];
      }
    }
    const sorted = Object.fromEntries(
      Object.entries(next).sort(([a], [b]) => a.localeCompare(b)),
    );
    await writeFile(manifestPath, JSON.stringify(sorted, null, 2) + "\n", "utf8");
    removed = await pruneUnlisted(new Set([...referenced, ...Object.keys(next)]));
  }

  if (catalog.source) delete catalog.source.brand;

  await writeFile(jsonPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  console.log(
    `\nImages: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed, ${removed} removed`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
