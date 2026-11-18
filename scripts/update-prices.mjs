/**
 * Patches wholesale cost in src/data/products.json from a Forzex-style workbook.
 * List and transfer prices are computed at runtime from site.json pricing.
 * Names, copy, images, and stock are left as-is.
 *
 *   node scripts/update-prices.mjs
 *   node scripts/update-prices.mjs --file list.xlsx
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { retailFromCost } from "../src/lib/pricing.mjs";
import {
  ROOT,
  findVariant,
  pickCatalogProduct,
  readListRows,
  resolveWorkbook,
} from "./price-list.mjs";

const CATALOG = join(ROOT, "src/data/products.json");
const SITE = join(ROOT, "src/data/site.json");

function pct(from, to) {
  if (!from) return to ? "+∞" : "0.0";
  return `${(((to - from) / from) * 100).toFixed(1)}%`;
}

function reportProblems(problems) {
  console.error("Price update aborted; fix matching first:");
  for (const p of problems) {
    if (p.kind === "unmatched") {
      console.error(`  unmatched  ${p.score.toFixed(2)}  ${p.row.code}  ${p.row.name}`);
    } else if (p.kind === "ambiguous") {
      console.error(
        `  ambiguous  ${p.score.toFixed(2)} vs ${p.otherScore.toFixed(2)}  ${p.row.code}  ${p.row.name}`,
      );
      console.error(`             ${p.product}  |  ${p.other}`);
    } else if (p.kind === "no-variant") {
      console.error(`  no-variant ${p.row.code}  ${p.row.name} → ${p.product} [${p.flavors}]`);
    } else {
      console.error(
        `  collision  ${p.row.code}  ${p.row.name} → ${p.product} / ${p.variant} (also ${p.other.code})`,
      );
    }
  }
}

async function main() {
  const workbook = resolveWorkbook(process.argv);
  const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
  const site = JSON.parse(await readFile(SITE, "utf8"));
  const { margin, transferDiscount } = site.pricing;
  const rows = readListRows(workbook.path);
  const stockBefore = catalog.products.flatMap((p) =>
    p.variants.map((v) => [`${p.id}::${v.id}`, v.inStock]),
  );
  const claimed = new Map();
  const problems = [];
  const diffs = [];

  for (const row of rows) {
    const picked = pickCatalogProduct(row.name, catalog.products);
    if (!picked.product) {
      problems.push({ kind: "unmatched", row, score: picked.score });
      continue;
    }
    if (picked.ambiguous) {
      problems.push({
        kind: "ambiguous",
        row,
        score: picked.score,
        product: picked.product.name,
        other: picked.second.product.name,
        otherScore: picked.second.score,
      });
      continue;
    }
    const variant = findVariant(picked.product, row.name);
    if (!variant) {
      problems.push({
        kind: "no-variant",
        row,
        product: picked.product.name,
        flavors: picked.product.variants.map((v) => v.name).join(", "),
      });
      continue;
    }
    const key = `${picked.product.id}::${variant.id}`;
    if (claimed.has(key)) {
      problems.push({
        kind: "collision",
        row,
        other: claimed.get(key),
        product: picked.product.name,
        variant: variant.name,
      });
      continue;
    }
    claimed.set(key, row);
    const oldCost = Number(variant.cost);
    const oldRetail = Number.isFinite(oldCost)
      ? retailFromCost(oldCost, margin, transferDiscount)
      : { price: variant.price, transferPrice: variant.transferPrice };
    const next = retailFromCost(row.unit, margin, transferDiscount);
    diffs.push({
      code: row.code,
      sheet: row.name.trim(),
      product: picked.product.name,
      variant: variant.name,
      oldCost: Number.isFinite(oldCost) ? oldCost : variant.price,
      oldPrice: oldRetail.price,
      oldTransfer: oldRetail.transferPrice,
      cost: row.unit,
      price: next.price,
      transferPrice: next.transferPrice,
    });
    variant.cost = row.unit;
    delete variant.price;
    delete variant.transferPrice;
  }

  if (problems.length) {
    reportProblems(problems);
    process.exit(1);
  }

  const variantCount = catalog.products.reduce((n, p) => n + p.variants.length, 0);
  const untouched = variantCount - claimed.size;

  catalog.updatedAt = new Date().toISOString().slice(0, 10);
  catalog.source = { sheet: workbook.filename };
  await writeFile(CATALOG, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  const stockAfter = catalog.products.flatMap((p) =>
    p.variants.map((v) => [`${p.id}::${v.id}`, v.inStock]),
  );
  const stockChanged = stockBefore.filter(([, v], i) => stockAfter[i][1] !== v).length;

  diffs.sort((a, b) => Math.abs(b.price - b.oldPrice) - Math.abs(a.price - a.oldPrice));
  console.log(`Updated ${diffs.length} costs from ${workbook.filename} → ${CATALOG}`);
  console.log(
    `Retail uses margin ${(margin * 100).toFixed(1)}% + transfer ${((1 - transferDiscount) * 100).toFixed(0)}%`,
  );
  console.log(`In stock unchanged: ${stockChanged === 0 ? "yes" : `NO (${stockChanged})`}`);
  if (untouched > 0) {
    console.log(`Left ${untouched} catalog variants unchanged (not in workbook).`);
  }
  console.log("Largest moves:");
  for (const d of diffs.slice(0, 12)) {
    console.log(
      `  ${d.product} / ${d.variant}: ${d.oldPrice}/${d.oldTransfer} → ${d.price}/${d.transferPrice} (${pct(d.oldPrice, d.price)})`,
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
