import { describe, expect, it, vi } from 'vitest';
import { MAX_EXPORT_PAGES, download, exportAll, exportFilename } from '../export';
import { json, mockFetch } from './helpers';

const BOM = String.fromCharCode(0xfeff);
const csv = (text: string, next?: string) => new Response(text, { status: 200, headers: { 'content-type': 'text/csv', ...(next && { 'x-next-cursor': next }) } });

describe('exportAll', () => {
  it('stitches CSV pages, keeping one header', async () => {
    const pages: Record<string, Response> = {
      first: csv('id,created_at,status,name\r\n1,2026-09-14,ok,Ann\r\n', 'c1'),
      c1: csv('2,2026-09-13,ok,Ben\r\n', 'c2'),
      c2: csv('3,2026-09-12,spam,"Multi\r\nline"\r\n'),
    };
    const seen: (string | null)[] = [];
    const result = await exportAll('f1', 'csv', 'all', '', async (cursor) => {
      seen.push(cursor);
      return pages[cursor ?? 'first'];
    });
    expect(seen).toEqual([null, 'c1', 'c2']);
    expect(result.content).toBe(`${BOM}id,created_at,status,name\r\n1,2026-09-14,ok,Ann\r\n2,2026-09-13,ok,Ben\r\n3,2026-09-12,spam,"Multi\r\nline"\r\n`);
    expect(result).toMatchObject({ mime: 'text/csv;charset=utf-8', rows: null, pages: 3 });
  });

  it('drops a BOM the server may send, and skips empty pages', async () => {
    const result = await exportAll('f1', 'csv', 'inbox', '', async (cursor) => (cursor ? csv('') : csv(`${BOM}id\r\n1\r\n`, 'c1')));
    expect(result.content).toBe(`${BOM}id\r\n1\r\n`);
  });

  it('concatenates JSON pages into one array', async () => {
    const result = await exportAll('f1', 'json', 'spam', '', async (cursor) =>
      cursor ? json({ data: [{ id: 'b' }], nextCursor: null }) : json({ data: [{ id: 'a' }], nextCursor: 'b' }, 200, { 'x-next-cursor': 'b' }),
    );
    expect(JSON.parse(result.content)).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result).toMatchObject({ rows: 2, pages: 2, mime: 'application/json' });
  });

  it('copes with a JSON page without data', async () => {
    const result = await exportAll('f1', 'json', 'all', '', async () => json({}));
    expect(result.rows).toBe(0);
  });

  it('stops on a repeated cursor and at the page cap', async () => {
    const same = await exportAll('f1', 'json', 'all', '', async () => json({ data: [] }, 200, { 'x-next-cursor': 'loop' }));
    expect(same.pages).toBe(2);
    let n = 0;
    const capped = await exportAll('f1', 'json', 'all', '', async () => json({ data: [] }, 200, { 'x-next-cursor': `c${n++}` }));
    expect(capped.pages).toBe(MAX_EXPORT_PAGES);
  });

  it('uses the export endpoint by default', async () => {
    const { calls } = mockFetch((call) => (call.url.includes('format=json') ? json({ data: [] }) : csv('id\r\n')));
    await exportAll('abc1234567', 'csv', 'starred');
    expect(calls[0].url).toBe('/api/forms/abc1234567/export?format=csv&filter=starred');
    await exportAll('abc1234567', 'json', 'all', ' SM8 7Q2K ');
    expect(calls[1].url).toBe('/api/forms/abc1234567/export?format=json&filter=all&q=SM8+7Q2K');
  });
});

describe('exportFilename', () => {
  it('slugs the form name and dates the file', () => {
    expect(exportFilename('Tom & Priya RSVP!', 'inbox', 'csv', Date.UTC(2026, 8, 14))).toBe('sendm8-tom-priya-rsvp-inbox-2026-09-14.csv');
    expect(exportFilename('***', 'all', 'json', Date.UTC(2026, 0, 2))).toBe('sendm8-form-all-2026-01-02.json');
  });
});

describe('download', () => {
  it('clicks a temporary link to a blob URL', () => {
    vi.useFakeTimers();
    const a = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => a), body: { appendChild: vi.fn() } });
    vi.stubGlobal('window', { setTimeout });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    download('a.csv', 'id\r\n', 'text/csv');
    expect(a).toMatchObject({ href: 'blob:x', download: 'a.csv' });
    expect(a.click).toHaveBeenCalled();
    expect(a.remove).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    vi.useRealTimers();
  });
});
