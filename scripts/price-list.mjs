/**
 * Shared Forzex-style workbook path, reader, and name/flavor matcher.
 *
 *   DEFAULT_WORKBOOK is the file used when no CLI argument is given.
 *   Override with --file name.xlsx or a positional name.xlsx.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_WORKBOOK = "Forzex.xlsx";
export const SHEET_NAME = "Hoja1";
export const MATCH_THRESHOLD = 0.38;
export const AMBIGUOUS_DELTA = 0.04;

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

export function resolveWorkbook(argv = process.argv) {
  const args = argv.slice(2);
  const fileFlag = args.indexOf("--file");
  let name = DEFAULT_WORKBOOK;
  if (fileFlag !== -1) {
    name = args[fileFlag + 1];
    if (!name || name.startsWith("-")) {
      throw new Error("Missing workbook filename after --file");
    }
  } else {
    const positional = args.find((arg) => !arg.startsWith("-") && /\.xlsx$/i.test(arg));
    if (positional) name = positional;
  }
  const path = isAbsolute(name) ? name : join(ROOT, name);
  if (!existsSync(path)) throw new Error(`Workbook not found: ${path}`);
  return { path, filename: basename(path) };
}

function stripAccents(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalize(s) {
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

function flavorNorm(s) {
  return normalize(s).replace(/\bAND\b/g, " ").replace(/\s+/g, " ").trim();
}

const FLAVOR_TOKENS = new Set(
  FLAVOR_ALIASES.flatMap(([alias, label]) =>
    `${flavorNorm(alias)} ${flavorNorm(label)}`.split(" ").filter((w) => w.length > 1),
  ),
);

function identityTokens(s) {
  return tokens(s).filter((w) => !FLAVOR_TOKENS.has(w) && !/^\d/.test(w));
}

function sheetHasFlavor(norm, { exceptUnflavored = false } = {}) {
  return FLAVOR_ALIASES.some(([alias]) => {
    if (exceptUnflavored && alias === "SIN SABOR") return false;
    return norm.includes(alias);
  });
}

function unflavoredOnlyTitle(title) {
  const norm = normalize(title);
  if (!norm.includes("SIN SABOR")) return false;
  return !sheetHasFlavor(norm, { exceptUnflavored: true });
}

export function slugify(s) {
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

export function scoreMatch(sheetName, product) {
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

  const namedFlavor = sheetHasFlavor(sNorm);
  const otherFlavor = sheetHasFlavor(sNorm, { exceptUnflavored: true });
  if (unflavoredOnlyTitle(product.title) && otherFlavor) coverage -= 0.5;
  if (unflavoredOnlyTitle(product.title) && !namedFlavor && sDoy) coverage += 0.2;
  if (/sabores nuevos/i.test(product.title) && namedFlavor) coverage += 0.25;
  if (/sabores nuevos/i.test(product.title) && !namedFlavor) coverage -= 0.35;

  if (/60 capsulas/i.test(product.title) && /30/.test(sNorm) && !/60/.test(sNorm))
    coverage -= 0.5;
  if (/30 capsulas/i.test(product.title) && /60/.test(sNorm)) coverage -= 0.5;

  const sCaps = /\b(CAPS|CAP|COMP)\b/.test(sNorm);
  const pCaps = /capsulas/i.test(product.title);
  const pPowder = /polvo/i.test(product.title);
  if (sCaps && pCaps) coverage += 0.2;
  if (sCaps && pPowder) coverage -= 0.35;

  const sheetIdentity = identityTokens(expandSheetName(sheetName));
  const productIdentity = new Set(identityTokens(product.title));
  if (sheetIdentity.length && !sheetIdentity.some((token) => productIdentity.has(token))) {
    coverage -= 0.25;
  }

  return coverage;
}

function flavorOption(product) {
  return (product.options || []).find((o) => !/^title$/i.test(o.name));
}

export function detectFlavor(sheetName, product) {
  const expanded = expandSheetName(sheetName);
  const norm = flavorNorm(expanded);
  const opt = flavorOption(product);

  if (opt) {
    let best = null;
    let bestLen = 0;
    for (const val of opt.values) {
      const vn = flavorNorm(val);
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

export function prettyFlavor(flavor) {
  if (!flavor || flavor === "Único") return "Único";
  const key = flavorNorm(flavor);
  const mapped = FLAVOR_ALIASES.find(([, label]) => flavorNorm(label) === key);
  if (mapped) return mapped[1];
  return flavor
    .toLowerCase()
    .replace(/(^|[\s\-&])\S/g, (c) => c.toUpperCase())
    .replace("&Amp;", "&");
}

export function flavorFitsProduct(sheetName, product) {
  const opt = flavorOption(product);
  if (!opt?.values?.length) return true;
  const flavor = flavorNorm(detectFlavor(sheetName, product));
  return opt.values.some((value) => {
    const vn = flavorNorm(value);
    return vn === flavor || vn.includes(flavor) || flavor.includes(vn);
  });
}

export function pickShopifyProduct(sheetName, products) {
  let best = null;
  let bestScore = 0;
  for (const product of products) {
    if (!flavorFitsProduct(sheetName, product)) continue;
    const score = scoreMatch(sheetName, product);
    if (score > bestScore) {
      bestScore = score;
      best = product;
    }
  }
  if (!best || bestScore < MATCH_THRESHOLD) return { product: null, score: bestScore };
  return { product: best, score: bestScore };
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

export function pickCatalogProduct(sheetName, products) {
  const ranked = products
    .map((product) => {
      const like = asShopifyLike(product);
      return {
        product,
        score: flavorFitsProduct(sheetName, like)
          ? scoreMatch(sheetName, like)
          : -1,
      };
    })
    .filter((item) => item.score >= 0)
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

export function findVariant(product, sheetName) {
  const flavor = prettyFlavor(detectFlavor(sheetName, asShopifyLike(product)));
  const id = slugify(flavor) || "unico";
  const byId = product.variants.find((v) => v.id === id);
  if (byId) return byId;
  const byName = product.variants.find((v) => normalize(v.name) === normalize(flavor));
  if (byName) return byName;
  if (product.variants.length === 1) return product.variants[0];
  return null;
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

function sheetTarget(workbookXml, relsXml, sheetName, xlsxPath) {
  const sheets = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({
    name: attr(m[1], "name"),
    rid: attr(m[1], "r:id"),
  }));
  const sheet = sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`Sheet ${sheetName} not found in ${basename(xlsxPath)}`);
  const rels = [...relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => ({
    id: attr(m[1], "Id"),
    target: attr(m[1], "Target"),
  }));
  const rel = rels.find((r) => r.id === sheet.rid);
  if (!rel) throw new Error(`Relationship ${sheet.rid} not found`);
  return rel.target.startsWith("xl/")
    ? rel.target
    : `xl/${rel.target.replace(/^\.\//, "")}`;
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

export function readListRows(xlsxPath) {
  const workbook = unzipEntry(xlsxPath, "xl/workbook.xml");
  const rels = unzipEntry(xlsxPath, "xl/_rels/workbook.xml.rels");
  const shared = sharedStrings(unzipEntry(xlsxPath, "xl/sharedStrings.xml"));
  const target = sheetTarget(workbook, rels, SHEET_NAME, xlsxPath);
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
