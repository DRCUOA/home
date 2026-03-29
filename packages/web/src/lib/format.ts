export function formatCurrency(value: number | undefined | null): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | undefined | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatPercent(value: number | undefined | null): string {
  if (value == null) return "-";
  return `${value.toFixed(2)}%`;
}

export function formatNumber(value: number | undefined | null): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-NZ").format(value);
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
