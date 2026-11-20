import { formatARS, whatsappHref } from "./catalog";

export type OrderLine = {
  productId: string;
  name: string;
  flavorId: string;
  flavorName: string;
  quantity: number;
  price: number;
  transferPrice: number;
};

const KEY = "sasu-order";

function isLine(value: unknown): value is OrderLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<OrderLine>;
  return (
    typeof line.productId === "string" &&
    typeof line.name === "string" &&
    typeof line.flavorId === "string" &&
    typeof line.flavorName === "string" &&
    typeof line.quantity === "number" &&
    Number.isFinite(line.quantity) &&
    line.quantity >= 1 &&
    typeof line.price === "number" &&
    Number.isFinite(line.price) &&
    typeof line.transferPrice === "number" &&
    Number.isFinite(line.transferPrice)
  );
}

export function readOrder(): OrderLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLine).map((line) => ({
      ...line,
      quantity: Math.min(99, Math.floor(line.quantity)),
    }));
  } catch {
    return [];
  }
}

function writeOrder(lines: OrderLine[]) {
  localStorage.setItem(KEY, JSON.stringify(lines));
  document.dispatchEvent(new CustomEvent("sasu-order"));
}

export function orderCount(lines: OrderLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function addToOrder(item: Omit<OrderLine, "quantity">) {
  const lines = readOrder();
  const found = lines.find(
    (line) => line.productId === item.productId && line.flavorId === item.flavorId,
  );
  if (found) {
    found.quantity = Math.min(99, found.quantity + 1);
    found.name = item.name;
    found.flavorName = item.flavorName;
    found.price = item.price;
    found.transferPrice = item.transferPrice;
  } else {
    lines.push({ ...item, quantity: 1 });
  }
  writeOrder(lines);
  return lines;
}

export function setQuantity(productId: string, flavorId: string, quantity: number) {
  const next = Math.min(99, Math.floor(quantity));
  const lines = readOrder().flatMap((line) => {
    if (line.productId !== productId || line.flavorId !== flavorId) return [line];
    if (next < 1) return [];
    return [{ ...line, quantity: next }];
  });
  writeOrder(lines);
  return lines;
}

export function removeLine(productId: string, flavorId: string) {
  const lines = readOrder().filter(
    (line) => line.productId !== productId || line.flavorId !== flavorId,
  );
  writeOrder(lines);
  return lines;
}

export function orderTotals(lines: OrderLine[]) {
  return lines.reduce(
    (totals, line) => ({
      price: totals.price + line.price * line.quantity,
      transferPrice: totals.transferPrice + line.transferPrice * line.quantity,
    }),
    { price: 0, transferPrice: 0 },
  );
}

export function orderMessage(lines: OrderLine[]) {
  const totals = orderTotals(lines);
  const rows = lines.map((line) => {
    const flavor = line.flavorName && line.flavorName !== "Único" ? ` (${line.flavorName})` : "";
    return `- ${line.name}${flavor} x${line.quantity} — ${formatARS(line.transferPrice)}`;
  });
  return [
    "Hola, quiero hacer este pedido:",
    ...rows,
    `Total transferencia: ${formatARS(totals.transferPrice)}`,
    `Total lista: ${formatARS(totals.price)}`,
  ].join("\n");
}

export function orderHref(phone: string, lines: OrderLine[]) {
  return whatsappHref(phone, orderMessage(lines));
}
