/**
 * Exports are capped at 1,000 rows per request. Follow `X-Next-Cursor` and stitch the pages.
 * CSV pages share one column set for the whole export and only the first carries the header,
 * so they concatenate as they are. JSON pages are `{ data, nextCursor }`.
 */
import type { SubmissionDto, SubmissionFilter } from '@sendm8/shared';
import { api } from './endpoints';

export interface ExportResult {
  content: string;
  mime: string;
  /** Row count for JSON. Null for CSV, where quoted cells can span lines. */
  rows: number | null;
  pages: number;
}

type ExportPage = (cursor: string | null) => Promise<Response>;

/** Safety net against a cursor that never ends. 200 pages is 200,000 rows. */
export const MAX_EXPORT_PAGES = 200;

const BOM = String.fromCharCode(0xfeff);

export async function exportAll(
  formId: string,
  format: 'csv' | 'json',
  filter: SubmissionFilter,
  q = '',
  fetchPage: ExportPage = (cursor) => api.exportPage(formId, format, filter, cursor, q),
): Promise<ExportResult> {
  let cursor: string | null = null;
  let pages = 0;
  const csvParts: string[] = [];
  const rows: SubmissionDto[] = [];

  do {
    const res = await fetchPage(cursor);
    pages++;
    const next = res.headers.get('x-next-cursor');
    if (format === 'csv') {
      let text = await res.text();
      if (text.startsWith(BOM)) text = text.slice(1);
      text = text.replace(/^(\r?\n)+/, '').replace(/(\r?\n)+$/, '');
      if (text) csvParts.push(text);
    } else {
      const body = (await res.json()) as { data?: SubmissionDto[] };
      rows.push(...(body.data ?? []));
    }
    cursor = next && next !== cursor ? next : null;
  } while (cursor && pages < MAX_EXPORT_PAGES);

  if (format === 'csv') {
    // The BOM makes Excel read the file as UTF-8.
    return { content: BOM + csvParts.join('\r\n') + '\r\n', mime: 'text/csv;charset=utf-8', rows: null, pages };
  }
  return { content: JSON.stringify(rows, null, 2), mime: 'application/json', rows: rows.length, pages };
}

export function exportFilename(formName: string, filter: string, format: 'csv' | 'json', now = Date.now()) {
  const slug = formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form';
  return `sendm8-${slug}-${filter}-${new Date(now).toISOString().slice(0, 10)}.${format}`;
}

/** Browser-only: hands the file to the user. */
export function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
