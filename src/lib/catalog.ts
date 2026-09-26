import site from "../data/site.json";
import { retailFromCost } from "./pricing.mjs";

export type Variant = {
  id: string;
  name: string;
  cost: number;
  price: number;
  transferPrice: number;
  inStock: boolean;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  brand?: string;
  description: string;
  images: string[];
  variants: Variant[];
};

export type Catalog = {
  updatedAt: string;
  source: { sheet: string };
  products: Product[];
};

export type Site = {
  name: string;
  whatsapp: string;
  tagline: string;
  description: string;
  logo?: string;
  pricing: {
    margin: number;
    transferDiscount: number;
  };
};

export function isRemoteUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export function imageSrc(url: string, width: number) {
  if (!isRemoteUrl(url)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}

export function srcSet(url: string, widths = [320, 480, 720, 1080]) {
  if (!isRemoteUrl(url)) return undefined;
  return widths.map((w) => `${imageSrc(url, w)} ${w}w`).join(", ");
}

export function formatARS(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function hasStock(product: Product) {
  return product.variants.some((v) => v.inStock);
}

export function pricedVariant(variant: Pick<Variant, "cost"> & Partial<Variant>) {
  const { price, transferPrice } = retailFromCost(
    variant.cost,
    site.pricing.margin,
    site.pricing.transferDiscount,
  );
  return { ...variant, price, transferPrice } as Variant;
}

export function withRetail(product: Product) {
  return {
    ...product,
    variants: product.variants.map((variant) => pricedVariant(variant)),
  };
}

export function cheapest(product: Product) {
  return product.variants.reduce((min, v) =>
    v.transferPrice < min.transferPrice ? v : min,
  );
}

export function featuredVariant(product: Product) {
  return product.variants.find((v) => v.inStock) ?? cheapest(product);
}

export function visibleFlavors(product: Product) {
  const real = product.variants.filter((v) => v.name !== "Único");
  return real.length ? real : product.variants;
}

export function whatsappDigits(raw: string) {
  return raw.replace(/\D/g, "");
}

export function whatsappHref(phone: string, message: string) {
  const digits = whatsappDigits(phone);
  const text = encodeURIComponent(message);
  return digits
    ? `https://wa.me/${digits}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

export function consultMessage(productName: string, variantName?: string) {
  const flavor =
    variantName && variantName !== "Único" ? ` (${variantName})` : "";
  return `Hola, quiero consultar por ${productName}${flavor}`;
}

export function categoriesOf(products: Product[]) {
  return [...new Set(products.map((p) => p.category))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}

export function transitionName(productId: string) {
  return `product-img-${productId.replace(/[^a-z0-9-]/gi, "")}`;
}
