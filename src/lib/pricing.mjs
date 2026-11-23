export function roundUpTo500(n) {
  return Math.ceil(n / 500) * 500;
}

export function retailFromCost(cost, margin, transferDiscount) {
  const price = roundUpTo500(cost / (1 - margin));
  const transferPrice = roundUpTo500(price * transferDiscount);
  return { price, transferPrice };
}
