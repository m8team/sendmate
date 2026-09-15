import type { SubmissionDto } from "@sendm8/shared";

/** Neutralises spreadsheet formula injection (=, +, -, @, tab, CR) and quotes as needed. */
function cell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

/**
 * Pass `columns` (the field names across the whole export) so every page of a multi-page export
 * lines up. Without it, columns come from this page's rows.
 */
export function submissionsToCsv(rows: SubmissionDto[], includeHeader: boolean, columns?: string[]): string {
  const fieldNames: string[] = columns ? [...columns] : [];
  const seen = new Set<string>(fieldNames);
  for (const row of rows) {
    for (const key of Object.keys(row.data)) {
      if (!seen.has(key)) {
        seen.add(key);
        fieldNames.push(key);
      }
    }
  }

  const lines: string[] = [];
  if (includeHeader) lines.push(["id", "created_at", "status", ...fieldNames].map(cell).join(","));
  for (const row of rows) {
    const values = fieldNames.map((name) => {
      const value = row.data[name];
      return Array.isArray(value) ? value.join("; ") : (value ?? "");
    });
    lines.push([row.id, new Date(row.createdAt).toISOString(), row.status, ...values].map(cell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
