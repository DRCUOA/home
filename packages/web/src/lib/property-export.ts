import type { Property } from "@hcc/shared";

export type ExportFormat = "json" | "csv" | "markdown";

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  json: "JSON",
  csv: "CSV",
  markdown: "Markdown table",
};

/**
 * Ordered set of Property fields included in a Buy-list export.
 *
 * Picture / photo associations are intentionally omitted: images are stored as
 * separate FileRecord rows linked by property_id, not as fields on Property, so
 * excluding them here needs no filtering. The original listing URL
 * (`listing_url`) is always included so the source listing stays reachable.
 */
type Column = { key: keyof Property; header: string };

const COLUMNS: Column[] = [
  { key: "address", header: "Address" },
  { key: "suburb", header: "Suburb" },
  { key: "city", header: "City" },
  { key: "property_type", header: "Property type" },
  { key: "listing_method", header: "Listing method" },
  { key: "price_asking", header: "Asking price" },
  { key: "price_guide_low", header: "Guide low" },
  { key: "price_guide_high", header: "Guide high" },
  { key: "bedrooms", header: "Bedrooms" },
  { key: "bathrooms", header: "Bathrooms" },
  { key: "parking", header: "Parking" },
  { key: "land_area_sqm", header: "Land m²" },
  { key: "floor_area_sqm", header: "Floor m²" },
  { key: "watchlist_status", header: "Watchlist status" },
  { key: "custom_type_ids", header: "Custom types" },
  { key: "favourite_rank", header: "Favourite rank" },
  { key: "rejection_reason", header: "Rejection reason" },
  { key: "listing_description", header: "Listing description" },
  { key: "latitude", header: "Latitude" },
  { key: "longitude", header: "Longitude" },
  { key: "listing_url", header: "Listing URL" },
  { key: "id", header: "ID" },
  { key: "created_at", header: "Created" },
  { key: "updated_at", header: "Updated" },
];

export type ExportResult = {
  content: string;
  mimeType: string;
  extension: string;
};

/** Stringify a single cell for the text-based (CSV / Markdown) formats. */
function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

function toJson(properties: Property[]): string {
  const rows = properties.map((p) => {
    const row: Record<string, unknown> = {};
    for (const { key } of COLUMNS) {
      // Callers substitute custom-type names for ids before exporting, so the
      // JSON key is renamed to match what the value actually holds.
      const jsonKey = key === "custom_type_ids" ? "custom_types" : key;
      // Preserve native types (numbers stay numbers) for JSON consumers.
      row[jsonKey] = p[key] ?? null;
    }
    return row;
  });
  return JSON.stringify(rows, null, 2);
}

function escapeCsv(value: string): string {
  // Quote when the value contains a delimiter, quote, or newline; double inner quotes.
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(properties: Property[]): string {
  const header = COLUMNS.map((c) => escapeCsv(c.header)).join(",");
  const rows = properties.map((p) =>
    COLUMNS.map((c) => escapeCsv(cellText(p[c.key]))).join(",")
  );
  return [header, ...rows].join("\r\n");
}

function escapeMarkdown(value: string): string {
  // Pipes break table cells; collapse newlines so each property stays one row.
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function toMarkdown(properties: Property[]): string {
  const header = `| ${COLUMNS.map((c) => escapeMarkdown(c.header)).join(" | ")} |`;
  const divider = `| ${COLUMNS.map(() => "---").join(" | ")} |`;
  const rows = properties.map(
    (p) => `| ${COLUMNS.map((c) => escapeMarkdown(cellText(p[c.key]))).join(" | ")} |`
  );
  return [header, divider, ...rows].join("\n");
}

export function buildPropertyExport(
  properties: Property[],
  format: ExportFormat
): ExportResult {
  switch (format) {
    case "json":
      return { content: toJson(properties), mimeType: "application/json", extension: "json" };
    case "csv":
      return { content: toCsv(properties), mimeType: "text/csv", extension: "csv" };
    case "markdown":
      return { content: toMarkdown(properties), mimeType: "text/markdown", extension: "md" };
  }
}

/** Trigger a browser download of text content as a file. */
export function downloadTextFile(filename: string, mimeType: string, content: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
