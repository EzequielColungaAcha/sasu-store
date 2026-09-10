/**
 * Builds src/data/products.json from the September Google Sheet
 * plus product copy/images from starnutrition.com.ar (Shopify JSON).
 *
 * Re-run when the sheet or official catalog changes:
 *   npm run catalog
 */
const SHEET_ID = "1pY-UBagwQxN0E9sUBukZUQYY8uDsaTZ6jZ4u8H5ilts";
const SHEET_TAB = "Data Septiembre";
const SHOPIFY_PRODUCTS = "https://starnutrition.com.ar/products.json?limit=250";
const OUT = new URL("../src/data/products.json", import.meta.url);

const CATEGORY_LABELS = {
  VITAMINICOS: "Vitamínicos",
  MAGNESIOS: "Magnesios",
  COLAGENOS: "Colágenos",
  COLÁGENOS: "Colágenos",
  "PRE ENTRENOS": "Pre entrenos",
  PROTEINAS: "Proteínas",
  PROTEÍNAS: "Proteínas",
  "AUMENTADORES DE MASA": "Aumentadores de masa",
  QUEMADORES: "Quemadores",
  "RECUPERADORES MUSCULARES": "Recuperadores musculares",
  AMINOACIDOS: "Aminoácidos",
  AMINOÁCIDOS: "Aminoácidos",
  "BEBIDAS ISOTONICAS": "Bebidas isotónicas",
};

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

const GENERIC = new Set([
  "MADE",
  "USA",
  "NUEVO",
  "LANZAMIENTO",
  "PROMO",
  "TACC",
  "ZIPPER",
  "PACK",
  "ENDURANCE",
  "STAR",
  "NUTRITION",
  "EEUU",
  "SERV",
  "THE",
  "AND",
  "DEL",
  "LOS",
  "LAS",
  "UNA",
  "CON",
  "PARA",
  "POR",
  "COMP",
  "CAPS",
  "CAP",
  "GRS",
  "GS",
  "GR",
  "G",
  "GRAMOS",
  "LBS",
  "LB",
  "LIBRAS",
  "KILO",
  "KILOS",
  "KG",
  "UNIDADES",
  "EN",
  "DE",
  "X",
  "SIN",
  "SABOR",
  "SABORES",
  "NUEVOS",
  "DTO",
]);

const FLAVOR_ALIASES = [
  ["COOKIES AND CREAM", "Cookies & Cream"],
  ["COOKIES CREAM", "Cookies & Cream"],
  ["STRAWBERRY LIME", "Strawberry-Lime"],
  ["STRAWBERRY CREAM", "Frutilla"],
  ["STRAWERRY CREAM", "Frutilla"],
  ["FRUIT PUNCH", "Fruit Punch"],
  ["GREEN LEMONADE", "Green Lemonade"],
  ["ACAÍ POWER", "Acaí Power"],
  ["ACAI POWER", "Acaí Power"],
  ["BLUE RAZZ", "Blue Raz"],
  ["BLUE RAZ", "Blue Raz"],
  ["LIMA LIMON", "Lima Limón"],
  ["LIMA LIMÓN", "Lima Limón"],
  ["CITRUS SLUSH", "Citrus Slush"],
  ["GRAPE ATTACK", "Grape Attack"],
  ["FRUTOS ROJOS", "Frutos Rojos"],
  ["SIN SABOR", "Sin sabor"],
  ["WATERMELON", "Watermelon"],
  ["CHOCOLATE", "Chocolate"],
  ["VAINILLA", "Vainilla"],
  ["FRUTILLA", "Frutilla"],
  ["BANANA", "Banana"],
  ["PISTACHO", "Pistacho"],
  ["NARANJA", "Naranja"],
  ["LEMONADE", "Lemonade"],
  ["WATERMELON", "Watermelon"],
  ["LIMON", "Limón"],
  ["LEMON", "Limón"],
  ["GRAPE", "Grape"],
  ["ACAI", "Acaí Power"],
  ["ACAÍ", "Acaí Power"],
];

const SHEET_FLAVOR_SHORT = [
  [" CHO ", " Chocolate "],
  [" VAI ", " Vainilla "],
];

function stripAccents(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalize(s) {
  let t = stripAccents(String(s || "")).toUpperCase();
  t = t.replace(/1\s*,\s*5/g, "1.5");
  t = t.replace(/NUEVO LANZAMIENTO/g, " ");
  t = t.replace(/RE LANZAMIENTO/g, " ");
  t = t.replace(/PROMO\s*\d+\s*%?/g, " ");
  t = t.replace(/MADE IN USA/g, " ");
  t = t.replace(/SIN TACC/g, " ");
  t = t.replace(/ZIPPER PACK/g, " ");
  t = t.replace(/100%/g, " ");
  t = t.replace(/&/g, " ");
  t = t.replace(/[^A-Z0-9.]+/g, " ");
  t = t.replace(/(\d+(?:\.\d+)?)(GRS|GS|GR|GRAMOS|KG|LBS|LB|CAPS|CAP|COMP|MG|G|K)\b/g, "$1 $2");
  t = t.replace(/\bK\b/g, "KG");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function tokens(s) {
  return normalize(s)
    .split(" ")
    .filter((w) => w && (w.length > 1 || w === "C") && !GENERIC.has(w) && w !== ".");
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parsePrice(raw) {
  const s = String(raw || "").replace(/\$/g, "").trim();
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseStock(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  const n = Number(s.replace(/,/g, "."));
  return Number.isFinite(n) && n > 0;
}

function slugify(s) {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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

function flavorOption(product) {
  return (product.options || []).find((o) => !/^title$/i.test(o.name));
}

function expandSheetName(name) {
  let n = ` ${name} `;
  n = n.replace(/MUTANTMASS/gi, "MUTANT MASS");
  n = n.replace(/MAGNESIO/gi, "CITRATO DE MAGNESIO");
  n = n.replace(/ESSENTIAL AMINO/gi, "EAAS ESSENTIAL AMINOS");
  n = n.replace(/ALL-?IN-?ONE VITAMIN/gi, "ALL IN ONE MULTIVITAMIN");
  n = n.replace(/\bVITAMIN C\b/gi, "VITAMINA C");
  n = n.replace(/\bLIQUID\b/gi, "LIQUIDA");
  n = n.replace(/1\s*,\s*5\s*K\b/gi, "1.5KG");
  for (const [from, to] of SHEET_FLAVOR_SHORT) n = n.replaceAll(from, to);
  return n.trim();
}

function detectFlavor(sheetName, product) {
  const expanded = expandSheetName(sheetName);
  const norm = normalize(expanded);
  const opt = flavorOption(product);

  if (opt) {
    let best = null;
    let bestLen = 0;
    for (const val of opt.values) {
      const vn = normalize(val);
      if (vn && norm.includes(vn) && vn.length >= bestLen) {
        best = val;
        bestLen = vn.length;
      }
    }
    if (best) return best;
  }

  for (const [alias, label] of FLAVOR_ALIASES) {
    if (norm.includes(alias)) {
      if (opt) {
        const match = opt.values.find(
          (v) =>
            normalize(v) === normalize(label) ||
            normalize(v).includes(normalize(label)) ||
            normalize(label).includes(normalize(v)),
        );
        if (match) return match;
        if (alias === "FRUIT PUNCH") {
          const frutos = opt.values.find((v) => /frutos/i.test(v));
          if (frutos) return frutos;
        }
        if (alias === "LEMON" || alias === "LIMON") {
          const lemon = opt.values.find((v) => /limon|lemon/i.test(v));
          if (lemon) return lemon;
        }
      }
      return label;
    }
  }

  return "Único";
}

function extractSizes(norm) {
  const sizes = new Set();
  const re =
    /\b(\d+(?:\.\d+)?)(?:\s*(KG|GR|GS|LB|KILO|KILOS|LIBRAS|MG|CAPS|CAP|COMP|SERV))?\b/g;
  for (const m of norm.matchAll(re)) {
    const n = m[1];
    const unit = m[2] || "";
    if (unit === "SERV") continue;
    if (unit || n === "2" || n === "3" || n === "5" || n === "1.5" || Number(n) >= 30) {
      sizes.add(n);
    }
  }
  return sizes;
}

function scoreMatch(sheetName, product) {
  const sTokens = new Set(tokens(expandSheetName(sheetName)));
  const pTokens = tokens(product.title);
  if (!pTokens.length) return 0;
  let hits = 0;
  for (const t of pTokens) if (sTokens.has(t)) hits++;
  const union = new Set([...sTokens, ...pTokens]);
  const jaccard = hits / union.size;
  let coverage = 0.4 * (hits / pTokens.length) + 0.6 * jaccard;

  const pNorm = normalize(product.title);
  const sNorm = normalize(expandSheetName(sheetName));

  const pSizes = extractSizes(pNorm);
  const sSizes = extractSizes(sNorm);
  if (pSizes.size && sSizes.size) {
    const overlap = [...pSizes].some((x) => sSizes.has(x));
    if (!overlap) coverage -= 0.55;
    else coverage += 0.12;
  }

  const pDoy = /doypack/i.test(pNorm);
  const sDoy = /doypack/i.test(sNorm);
  if (pDoy !== sDoy) coverage -= 0.28;
  if (/pote/i.test(pNorm) && sDoy) coverage -= 0.28;

  const pLiq = /liquid/i.test(pNorm);
  const sLiq = /liquid/i.test(sNorm);
  if (pLiq !== sLiq) coverage -= 0.35;

  const sheetHasFlavor = FLAVOR_ALIASES.some(([a]) => sNorm.includes(a));
  if (/sin sabor/i.test(product.title) && sheetHasFlavor) coverage -= 0.5;
  if (/sin sabor/i.test(product.title) && !sheetHasFlavor && sDoy) coverage += 0.2;
  if (/sabores nuevos/i.test(product.title) && sheetHasFlavor) coverage += 0.25;
  if (/sabores nuevos/i.test(product.title) && !sheetHasFlavor) coverage -= 0.35;

  if (/60 capsulas/i.test(product.title) && /30/.test(sNorm) && !/60/.test(sNorm))
    coverage -= 0.5;
  if (/30 capsulas/i.test(product.title) && /60/.test(sNorm)) coverage -= 0.5;

  return coverage;
}

function pickShopifyProduct(sheetName, products) {
  let best = null;
  let bestScore = 0;
  for (const p of products) {
    const sc = scoreMatch(sheetName, p);
    if (sc > bestScore) {
      bestScore = sc;
      best = p;
    }
  }
  if (bestScore < 0.38) return { product: null, score: bestScore };
  return { product: best, score: bestScore };
}

function niceCategory(sheetCat, productType) {
  if (sheetCat && CATEGORY_LABELS[sheetCat]) return CATEGORY_LABELS[sheetCat];
  if (productType && TYPE_LABELS[productType]) return TYPE_LABELS[productType];
  if (sheetCat) return CATEGORY_LABELS[normalize(sheetCat)] || titleCase(sheetCat);
  return TYPE_LABELS[productType] || titleCase(productType || "Otros");
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

function prettyFlavor(flavor) {
  if (!flavor || flavor === "Único") return "Único";
  const mapped = FLAVOR_ALIASES.find(
    ([, label]) => normalize(label) === normalize(flavor),
  );
  if (mapped) return mapped[1];
  return flavor
    .toLowerCase()
    .replace(/(^|[\s\-&])\S/g, (c) => c.toUpperCase())
    .replace("&Amp;", "&");
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

async function main() {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;
  const [csv, shopifyProducts] = await Promise.all([
    fetchText(sheetUrl),
    fetchShopifyProducts(),
  ]);

  const rows = parseCSV(csv);
  const grouped = new Map();
  const unmatched = [];
  let currentCategory = "";

  for (const row of rows.slice(1)) {
    while (row.length < 14) row.push("");
    const name = (row[1] || "").trim();
    if (!name) continue;
    const price = parsePrice(row[12]);
    const transferPrice = parsePrice(row[13]);
    if (price <= 0 && transferPrice <= 0) {
      currentCategory = name;
      continue;
    }

    const inStock = parseStock(row[2]);
    const { product, score } = pickShopifyProduct(name, shopifyProducts);
    if (!product) {
      unmatched.push({ name, score });
      const id = slugify(name);
      grouped.set(id, {
        id,
        slug: id,
        name: titleCase(name.replace(/\s+/g, " ")),
        category: niceCategory(currentCategory, ""),
        brand: "",
        description: "",
        images: [],
        variants: [
          {
            id: "unico",
            name: "Único",
            price,
            transferPrice,
            inStock,
          },
        ],
      });
      continue;
    }

    const flavor = prettyFlavor(detectFlavor(name, product));
    const key = product.handle;
    if (!grouped.has(key)) {
      const isCreatineWhey = /whey|protein|prote[ií]na/i.test(product.title);
      const category = /creatina/i.test(product.title) && !isCreatineWhey
        ? "Creatinas"
        : niceCategory(currentCategory, product.product_type);
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
    if (!item.variants.some((v) => v.id === vid)) {
      item.variants.push({
        id: vid,
        name: flavor,
        price,
        transferPrice,
        inStock,
      });
    } else {
      const existing = item.variants.find((v) => v.id === vid);
      existing.inStock = existing.inStock || inStock;
    }
  }

  const products = [...grouped.values()].map((p) => {
    p.variants.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return p;
  });
  products.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const payload = {
    updatedAt: new Date().toISOString().slice(0, 10),
    source: {
      sheet: SHEET_TAB,
    },
    products,
  };

  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const outPath = fileURLToPath(OUT);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(`Wrote ${products.length} products → ${outPath}`);
  console.log(
    `Variants: ${products.reduce((n, p) => n + p.variants.length, 0)}`,
  );
  console.log(
    `In stock: ${products.filter((p) => p.variants.some((v) => v.inStock)).length}`,
  );
  if (unmatched.length) {
    console.log("Unmatched sheet rows (fallback without Star Nutrition media):");
    for (const u of unmatched) console.log(`  ${u.score.toFixed(2)}  ${u.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
