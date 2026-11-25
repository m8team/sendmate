import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { indexNowBody, recentUrls, submitRecent } from '../../../scripts/indexnow.mjs';

const sitemap = `<?xml version="1.0"?><urlset>
<url><loc>https://sendm8.com/</loc><lastmod>2026-11-24T10:00:00.000Z</lastmod></url>
<url><loc>https://sendm8.com/docs/</loc><lastmod>2026-10-01T00:00:00.000Z</lastmod></url>
<url><loc>https://sendm8.com/guides/new/</loc></url>
</urlset>`;
const now = Date.parse('2026-11-25T12:00:00Z');

describe('IndexNow after a deploy', () => {
  it('picks pages changed in the window, and pages with no date', () => {
    expect(recentUrls(sitemap, now - 3 * 86_400_000)).toEqual(['https://sendm8.com/', 'https://sendm8.com/guides/new/']);
  });

  it('builds a request for one host with the key file at /indexnow.txt', () => {
    expect(indexNowBody(['https://sendm8.com/', 'https://other.test/x'], 'k')).toEqual({
      host: 'sendm8.com',
      key: 'k',
      keyLocation: 'https://sendm8.com/indexnow.txt',
      urlList: ['https://sendm8.com/'],
    });
  });

  it('submits the recent pages, and never throws when the request fails', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'indexnow-')) + '/';
    try {
      writeFileSync(`${dist}indexnow.txt`, 'abc123\n');
      writeFileSync(`${dist}sitemap-0.xml`, sitemap);
      const ok = vi.fn(async () => new Response(null, { status: 202 }));
      expect(await submitRecent({ dist, now, fetchImpl: ok })).toMatchObject({ submitted: 2, status: 202 });
      const sent = JSON.parse((ok.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(sent.key).toBe('abc123');

      const down = vi.fn(async () => {
        throw new Error('offline');
      });
      expect(await submitRecent({ dist, now, fetchImpl: down })).toEqual({ submitted: 0 });
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('does nothing in a copy without the key file', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'indexnow-')) + '/';
    try {
      const fetchImpl = vi.fn();
      expect(await submitRecent({ dist, fetchImpl })).toEqual({ submitted: 0 });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
