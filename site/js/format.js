export function text(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return String(value);
  }
  const s = String(value);
  if (s === "nan" || s === "NaN") return "—";
  return s;
}

export function compact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const ax = Math.abs(n);
  if (ax !== 0 && (ax < 1e-3 || ax >= 1e4)) return n.toExponential(3);
  const digits = ax >= 100 ? 4 : 6;
  const p = Number(n.toPrecision(digits));
  return String(p);
}

export function dayIndex(day, length) {
  if (!Number.isFinite(day)) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(day)));
}

export function sample(series, day) {
  if (!series || !series.length) return null;
  return series[dayIndex(day, series.length)];
}
