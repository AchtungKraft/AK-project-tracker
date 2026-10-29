export const money = (n) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const pct = (n) => (n == null ? "—" : `${n.toFixed(1)}%`);

export const hrs = (n) => (n == null ? "—" : `${Number(n).toFixed(1)}h`);