export function text(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return sig3(value);
  }
  const s = String(value);
  if (s === "nan" || s === "NaN") return "—";
  return sig3(s);
}

/** Three significant figures for a plain number. Fractions and ranges stay as stored. */
export function sig3(value) {
  if (value === null || value === undefined || value === "") return "—";
  const s = String(value).trim();
  if (s === "nan" || s === "NaN") return "—";
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)) return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  const ax = Math.abs(n);
  if (ax === 0) return "0";
  if (Number.isInteger(n) && ax < 1e6) return String(n);
  if (ax >= 1e4 || ax < 1e-3) return n.toExponential(2).replace("e+", "e");
  return n.toPrecision(3);
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
