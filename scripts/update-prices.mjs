/**
 * Patches retail prices in src/data/products.json from list.xlsx
 * wholesale unit prices, using the same 30.5% margin + 5% transfer
 * formula as Data Septiembre. Names, copy, images, and stock are left as-is.
 *
 *   node scripts/update-prices.mjs
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIST_XLSX = join(ROOT, "list.xlsx");
const CATALOG = join(ROOT, "src/data/products.json");
const SHEET_NAME = "Hoja1";
const MARGIN = 0.305;
const TRANSFER_DISCOUNT = 0.95;
const MATCH_THRESHOLD = 0.38;
const AMBIGUOUS_DELTA = 0.04;

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
  t = t.replace(
    /(\d+(?:\.\d+)?)(GRS|GS|GR|GRAMOS|KG|LBS|LB|CAPS|CAP|COMP|MG|G|K)\b/g,
    "$1 $2",
  );
  t = t.replace(/\bK\b/g, "KG");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function tokens(s) {
  return normalize(s)
    .split(" ")
    .filter((w) => w && (w.length > 1 || w === "C") && !GENERIC.has(w) && w !== ".");
}

function slugify(s) {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

  const sCaps = /\b(CAPS|CAP|COMP)\b/.test(sNorm);
  const pCaps = /capsulas/i.test(product.title);
  const pPowder = /polvo/i.test(product.title);
  if (sCaps && pCaps) coverage += 0.2;
  if (sCaps && pPowder) coverage -= 0.35;

  return coverage;
}

function flavorOption(product) {
  return (product.options || []).find((o) => !/^title$/i.test(o.name));
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

function asShopifyLike(product) {
  const values = product.variants
    .map((v) => v.name)
    .filter((name) => name !== "Único");
  return {
    title: product.name,
    options: values.length ? [{ name: "Sabor", values }] : [],
  };
}

function pickCatalogProduct(sheetName, products) {
  const ranked = products
    .map((product) => ({
      product,
      score: scoreMatch(sheetName, asShopifyLike(product)),
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < MATCH_THRESHOLD) {
    return { product: null, score: best?.score ?? 0, ambiguous: false };
  }
  const ambiguous =
    second &&
    second.score >= MATCH_THRESHOLD &&
    best.score - second.score < AMBIGUOUS_DELTA;
  return {
    product: best.product,
    score: best.score,
    ambiguous,
    second: ambiguous ? second : null,
  };
}

function findVariant(product, sheetName) {
  const flavor = prettyFlavor(detectFlavor(sheetName, asShopifyLike(product)));
  const id = slugify(flavor) || "unico";
  const byId = product.variants.find((v) => v.id === id);
  if (byId) return byId;
  const byName = product.variants.find(
    (v) => normalize(v.name) === normalize(flavor),
  );
  if (byName) return byName;
  if (product.variants.length === 1) return product.variants[0];
  return null;
}

function excelRound(n, digits) {
  const p = 10 ** digits;
  const shifted = n * p;
  const sign = Math.sign(shifted) || 1;
  return (Math.trunc(Math.abs(shifted) + 0.5) * sign) / p;
}

function excelRoundTo10(n) {
  return excelRound(n / 10, 0) * 10;
}

function retailFromUnit(unit) {
  const price = excelRoundTo10(unit / (1 - MARGIN));
  const transferPrice = excelRoundTo10(price * TRANSFER_DISCOUNT);
  return { price, transferPrice };
}

function unzipEntry(xlsxPath, innerPath) {
  return execFileSync("unzip", ["-p", xlsxPath, innerPath], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function colToIndex(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sharedStrings(xml) {
  const strings = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const texts = [...si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
      m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'"),
    );
    strings.push(texts.join(""));
  }
  return strings;
}

function attr(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "";
}

function sheetTarget(workbookXml, relsXml, sheetName) {
  const sheets = [
    ...workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g),
  ].map((m) => ({
    name: attr(m[1], "name"),
    rid: attr(m[1], "r:id"),
  }));
  const sheet = sheets.find((s) => s.name === sheetName) ?? sheets[0];
  if (!sheet) throw new Error(`Sheet ${sheetName} not found`);
  const rels = [
    ...relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g),
  ].map((m) => ({
    id: attr(m[1], "Id"),
    target: attr(m[1], "Target"),
  }));
  const rel = rels.find((r) => r.id === sheet.rid);
  if (!rel) throw new Error(`Relationship ${sheet.rid} not found`);
  const target = rel.target.startsWith("xl/")
    ? rel.target
    : `xl/${rel.target.replace(/^\.\//, "")}`;
  return target;
}

function sheetRows(xml, shared, maxCols = 10) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = Array(maxCols).fill("");
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = attr(cell[1], "r");
      const col = ref.replace(/\d+/g, "");
      const idx = colToIndex(col);
      if (idx < 0 || idx >= maxCols) continue;
      const t = attr(cell[1], "t");
      const v = cell[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      if (v == null) continue;
      cells[idx] = t === "s" ? (shared[Number(v)] ?? "") : v;
    }
    rows.push(cells);
  }
  return rows;
}

function readListRows(xlsxPath) {
  const workbook = unzipEntry(xlsxPath, "xl/workbook.xml");
  const rels = unzipEntry(xlsxPath, "xl/_rels/workbook.xml.rels");
  const shared = sharedStrings(unzipEntry(xlsxPath, "xl/sharedStrings.xml"));
  const target = sheetTarget(workbook, rels, SHEET_NAME);
  const rows = sheetRows(unzipEntry(xlsxPath, target), shared);
  const items = [];
  for (const row of rows) {
    const code = String(row[0] || "").trim();
    const name = String(row[1] || "").trim();
    const unit = Number(String(row[5] || "").replace(",", "."));
    if (!code || !name || !Number.isFinite(unit) || unit <= 0) continue;
    items.push({ code, name, unit });
  }
  return items;
}

function pct(from, to) {
  if (!from) return to ? "+∞" : "0.0";
  return `${(((to - from) / from) * 100).toFixed(1)}%`;
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
  const rows = readListRows(LIST_XLSX);
  const stockBefore = catalog.products.flatMap((p) =>
    p.variants.map((v) => [`${p.id}::${v.id}`, v.inStock]),
  );
  const claimed = new Map();
  const problems = [];
  const diffs = [];

  for (const row of rows) {
    const picked = pickCatalogProduct(row.name, catalog.products);
    if (!picked.product) {
      problems.push({
        kind: "unmatched",
        row,
        score: picked.score,
      });
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
    const next = retailFromUnit(row.unit);
    diffs.push({
      code: row.code,
      sheet: row.name.trim(),
      product: picked.product.name,
      variant: variant.name,
      oldPrice: variant.price,
      oldTransfer: variant.transferPrice,
      price: next.price,
      transferPrice: next.transferPrice,
    });
    variant.price = next.price;
    variant.transferPrice = next.transferPrice;
  }

  if (problems.length) {
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
    process.exit(1);
  }

  const variantCount = catalog.products.reduce((n, p) => n + p.variants.length, 0);
  if (claimed.size !== variantCount) {
    const missing = [];
    for (const product of catalog.products) {
      for (const variant of product.variants) {
        const key = `${product.id}::${variant.id}`;
        if (!claimed.has(key)) missing.push(`${product.name} / ${variant.name}`);
      }
    }
    console.error(`Coverage ${claimed.size}/${variantCount}. Missing:`);
    for (const m of missing) console.error(`  ${m}`);
    process.exit(1);
  }

  catalog.updatedAt = new Date().toISOString().slice(0, 10);
  catalog.source = { sheet: "list.xlsx" };
  await writeFile(CATALOG, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  const stockAfter = catalog.products.flatMap((p) =>
    p.variants.map((v) => [`${p.id}::${v.id}`, v.inStock]),
  );
  const stockChanged = stockBefore.filter(([k, v], i) => stockAfter[i][1] !== v).length;

  diffs.sort((a, b) => Math.abs(b.price - b.oldPrice) - Math.abs(a.price - a.oldPrice));
  console.log(`Updated ${diffs.length} variants from list.xlsx → ${CATALOG}`);
  console.log(`In stock unchanged: ${stockChanged === 0 ? "yes" : `NO (${stockChanged})`}`);
  console.log("Largest moves:");
  for (const d of diffs.slice(0, 12)) {
    console.log(
      `  ${d.product} / ${d.variant}: ${d.oldPrice}/${d.oldTransfer} → ${d.price}/${d.transferPrice} (${pct(d.oldPrice, d.price)})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
