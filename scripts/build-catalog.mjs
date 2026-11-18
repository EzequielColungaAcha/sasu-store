/**
 * Builds src/data/products.json from a Forzex-style workbook
 * plus product copy/images from starnutrition.com.ar (Shopify JSON).
 *
 *   node scripts/build-catalog.mjs
 *   node scripts/build-catalog.mjs --file list.xlsx
 *
 * Wholesale cost is the workbook's PRECIO UNITARIO. Stock is carried
 * forward from the previous catalog when the same variant already exists.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ROOT,
  detectFlavor,
  normalize,
  pickShopifyProduct,
  prettyFlavor,
  readListRows,
  resolveWorkbook,
  slugify,
} from "./price-list.mjs";

const SHOPIFY_PRODUCTS = "https://starnutrition.com.ar/products.json?limit=250";
const CATALOG = join(ROOT, "src/data/products.json");

const TYPE_LABELS = {
  HEALT: "Bienestar",
  HEALTH: "Bienestar",
  "PRE ENTRENOS": "Pre entrenos",
  PROTEÍNAS: "Proteínas",
  PROTEINAS: "Proteínas",
  CREATINAS: "Creatinas",
  AMINOÁCIDOS: "Aminoácidos",
  GLUTAMINAS: "Glutaminas",
  "AUMENTADORES DE MASA": "Aumentadores de masa",
  "BEBIDAS ISOTÓNICAS": "Bebidas isotónicas",
  "BEBIDAS ISOTONICAS": "Bebidas isotónicas",
  "RECUPERADORES MUSCULARES": "Recuperadores musculares",
  QUEMADORES: "Quemadores",
  MULTIVITAMÍNICO: "Vitamínicos",
  MULTIVITAMINICO: "Vitamínicos",
};

function htmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function shopifyImages(product) {
  const urls = (product.images || []).map((img) => img.src).filter(Boolean);
  if (product.image?.src && !urls.includes(product.image.src)) {
    urls.unshift(product.image.src);
  }
  return urls;
}

function shopifyVariantImage(shopifyProduct, flavor) {
  const wanted = normalize(prettyFlavor(flavor));
  const variant = (shopifyProduct.variants || []).find((item) => {
    const option = item.option1 || item.title || "";
    return normalize(prettyFlavor(option)) === wanted || normalize(option) === wanted;
  });
  return variant?.featured_image?.src || "";
}

function titleCase(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function displayName(title) {
  const letters = String(title).replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  if (letters && letters === letters.toUpperCase()) {
    return title
      .toLowerCase()
      .replace(/(^|[\s\-/])\S/g, (c) => c.toUpperCase());
  }
  return title;
}

function niceCategory(productType) {
  if (productType && TYPE_LABELS[productType]) return TYPE_LABELS[productType];
  return titleCase(productType || "Otros");
}

function variantId(flavor) {
  return slugify(flavor) || "unico";
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "SASU-catalog/1.0" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function fetchShopifyProducts() {
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const url = `${SHOPIFY_PRODUCTS}&page=${page}`;
    const json = JSON.parse(await fetchText(url));
    const batch = json.products || [];
    all.push(...batch);
    if (batch.length < 50) break;
  }
  return all;
}

async function previousStock() {
  const stock = new Map();
  let catalog;
  try {
    catalog = JSON.parse(await readFile(CATALOG, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return stock;
    throw err;
  }
  for (const product of catalog.products || []) {
    for (const variant of product.variants || []) {
      stock.set(`${product.id}::${variant.id}`, Boolean(variant.inStock));
    }
  }
  return stock;
}

function carriedStock(stock, productId, variantId) {
  return stock.get(`${productId}::${variantId}`) ?? false;
}

async function main() {
  const workbook = resolveWorkbook(process.argv);
  const rows = readListRows(workbook.path);
  const [shopifyProducts, stock] = await Promise.all([
    fetchShopifyProducts(),
    previousStock(),
  ]);

  const grouped = new Map();
  const unmatched = [];

  for (const row of rows) {
    const { product, score } = pickShopifyProduct(row.name, shopifyProducts);
    if (!product) {
      unmatched.push({ name: row.name, score });
      let id = slugify(row.name);
      if (grouped.has(id)) id = slugify(`${row.name} ${row.code}`) || row.code.toLowerCase();
      grouped.set(id, {
        id,
        slug: id,
        name: titleCase(row.name.replace(/\s+/g, " ")),
        category: "Otros",
        brand: "",
        description: "",
        images: [],
        variants: [
          {
            id: "unico",
            name: "Único",
            cost: row.unit,
            inStock: carriedStock(stock, id, "unico"),
          },
        ],
      });
      continue;
    }

    const flavor = prettyFlavor(detectFlavor(row.name, product));
    const key = product.handle;
    if (!grouped.has(key)) {
      const isCreatineWhey = /whey|protein|prote[ií]na/i.test(product.title);
      const category =
        /creatina/i.test(product.title) && !isCreatineWhey
          ? "Creatinas"
          : niceCategory(product.product_type);
      grouped.set(key, {
        id: product.handle,
        slug: product.handle,
        name: displayName(product.title),
        category,
        brand: product.vendor || "Star Nutrition",
        description: htmlToText(product.body_html),
        images: shopifyImages(product),
        variants: [],
      });
    }
    const item = grouped.get(key);
    const vid = variantId(flavor);
    const image = shopifyVariantImage(product, flavor);
    const existing = item.variants.find((v) => v.id === vid);
    if (!existing) {
      item.variants.push({
        id: vid,
        name: flavor,
        ...(image ? { image } : {}),
        cost: row.unit,
        inStock: carriedStock(stock, item.id, vid),
      });
    } else {
      existing.cost = row.unit;
      if (image) existing.image = image;
    }
  }

  const products = [...grouped.values()].map((p) => {
    p.variants.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return p;
  });
  products.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const payload = {
    updatedAt: new Date().toISOString().slice(0, 10),
    source: { sheet: workbook.filename },
    products,
  };

  await writeFile(CATALOG, JSON.stringify(payload, null, 2) + "\n", "utf8");

  const variantCount = products.reduce((n, p) => n + p.variants.length, 0);
  console.log(`Wrote ${products.length} products (${variantCount} variants) from ${workbook.filename}`);
  console.log(`→ ${CATALOG}`);
  console.log(`In stock: ${products.filter((p) => p.variants.some((v) => v.inStock)).length}`);
  if (unmatched.length) {
    console.log("Unmatched workbook rows (fallback without Star Nutrition media):");
    for (const u of unmatched) console.log(`  ${u.score.toFixed(2)}  ${u.name}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
