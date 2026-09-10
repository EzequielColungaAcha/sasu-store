/**
 * Downloads remote product images into public/images/products/{slug}/
 * as 01.webp, 02.webp, … and rewrites src/data/products.json.
 *
 *   npm run images
 *   npm run images -- --force
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const force = process.argv.includes("--force");
const root = path.dirname(fileURLToPath(new URL(".", import.meta.url)));
const jsonPath = path.join(root, "src/data/products.json");

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

async function main() {
  const catalog = JSON.parse(await readFile(jsonPath, "utf8"));
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

  await mapLimit(jobs, 8, async (job) => {
    const { src, destRel, destAbs, product, index } = job;

    if (!src.startsWith("http")) {
      product.images[index] = src.startsWith("/") ? src : destRel;
      skipped += 1;
      return;
    }

    if (!force && (await exists(destAbs))) {
      product.images[index] = destRel;
      skipped += 1;
      return;
    }

    try {
      const buf = await fetchBuffer(src);
      await saveWebp(buf, destAbs);
      product.images[index] = destRel;
      downloaded += 1;
      process.stdout.write(".");
    } catch (err) {
      failed += 1;
      console.error(`\n${product.name}: ${err.message}`);
    }
  });

  if (catalog.source) delete catalog.source.brand;

  await writeFile(jsonPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  console.log(
    `\nImages: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
