export type MinorUnits = bigint;

const INTEGER_PATTERN = /^-?\d+$/;

export function minor(value: string | number | bigint): MinorUnits {
  if (typeof value === "bigint") return value;
  const normalized = String(value);
  if (!INTEGER_PATTERN.test(normalized)) {
    throw new Error(`Expected integer minor units, received: ${normalized}`);
  }
  return BigInt(normalized);
}

export function basisPointsOf(value: MinorUnits, basisPoints: number): MinorUnits {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new Error("Basis points must be a non-negative integer.");
  }
  return (value * BigInt(basisPoints)) / 10_000n;
}

export function maximum(...values: MinorUnits[]): MinorUnits {
  if (values.length === 0) throw new Error("maximum requires at least one value");
  return values.reduce((current, value) => (value > current ? value : current));
}

export function minimum(...values: MinorUnits[]): MinorUnits {
  if (values.length === 0) throw new Error("minimum requires at least one value");
  return values.reduce((current, value) => (value < current ? value : current));
}

export function nonNegative(value: MinorUnits): MinorUnits {
  return value > 0n ? value : 0n;
}

export function formatMinorUnits(value: MinorUnits, currency = "USD", exponent = 2): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(exponent);
  const major = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(exponent, "0");
  const number = `${negative ? "-" : ""}${major.toLocaleString("en-US")}${
    exponent > 0 ? `.${fraction}` : ""
  }`;
  return `${currency} ${number}`;
}
