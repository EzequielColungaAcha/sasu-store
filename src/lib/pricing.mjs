export function excelRound(n, digits) {
  const p = 10 ** digits;
  const shifted = n * p;
  const sign = Math.sign(shifted) || 1;
  return (Math.trunc(Math.abs(shifted) + 0.5) * sign) / p;
}

export function excelRoundTo10(n) {
  return excelRound(n / 10, 0) * 10;
}

export function retailFromCost(cost, margin, transferDiscount) {
  const price = excelRoundTo10(cost / (1 - margin));
  const transferPrice = excelRoundTo10(price * transferDiscount);
  return { price, transferPrice };
}
