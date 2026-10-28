import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { docsSections } from '../components/docs/sections/docsSections';
import { competitors } from '../config/compare';
import { guides } from '../config/guides';
import { createLastmod, docsSectionFiles, gitDates, isIndexable, pageSource, statedDate, type SitemapData } from './sitemap';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const pagesDir = join(root, 'web/src/pages');

const data: SitemapData = {
  changelogDate: '2026-09-16',
  legal: { privacy: '# Privacy\n\n_Last updated: 15 September 2026_\n', terms: '# Terms\n\nNo date here.\n' },
};

/** Every route the build emits that a crawler may index: static pages plus the dynamic ones expanded. */
function indexablePaths(): string[] {
  const paths: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.astro') && !entry.name.includes('[')) {
        const route = `/${relative(pagesDir, full).replace(/\\/g, '/').replace(/\.astro$/, '').replace(/(^|\/)index$/, '')}`;
        paths.push(route);
      }
    }
  };
  walk(pagesDir);
  paths.push(
    ...docsSections.map((s) => `/docs/${s.id}`),
    ...competitors.filter((c) => c.slug).map((c) => `/vs/${c.slug}`),
    ...guides.map((g) => `/guides/${g.slug}`),
  );
  return paths.filter(isIndexable);
}

describe('isIndexable', () => {
  it('keeps marketing pages and drops noindex routes and their children', () => {
    expect(isIndexable('/')).toBe(true);
    expect(isIndexable('/docs/ajax/')).toBe(true);
    expect(isIndexable('/app')).toBe(false);
    expect(isIndexable('/app/forms/abc')).toBe(false);
    expect(isIndexable('/c/demo')).toBe(false);
    // A prefix only matches whole path segments.
    expect(isIndexable('/changelog')).toBe(true);
  });
});

describe('pageSource', () => {
  it('covers every indexable page, so none ships without a lastmod', () => {
    const paths = indexablePaths();
    expect(paths.length).toBeGreaterThan(15);
    for (const path of paths) expect(pageSource(path, data), path).not.toBeNull();
  });

  it('only lists files that exist, so a rename can’t silently drop a date', () => {
    for (const path of indexablePaths()) {
      const source = pageSource(path, data);
      if (source && 'files' in source) for (const file of source.files) expect(existsSync(join(root, file)), `${path}: ${file}`).toBe(true);
    }
  });

  it('maps each docs section to the component its page mounts', () => {
    expect(Object.keys(docsSectionFiles).sort()).toEqual(docsSections.map((s) => s.id).sort());
    const page = readFileSync(join(pagesDir, 'docs/[id].astro'), 'utf8');
    for (const file of Object.values(docsSectionFiles)) expect(page).toContain(`/sections/${file}'`);
  });

  it('ignores trailing slashes', () => {
    expect(pageSource('/pricing/', data)).toEqual(pageSource('/pricing', data));
  });

  it('uses stated dates for the changelog and dated legal pages, and git for undated ones', () => {
    expect(pageSource('/changelog/', data)).toEqual({ date: '2026-09-16' });
    expect(pageSource('/privacy/', data)).toEqual({ date: '2026-09-15' });
    expect(pageSource('/terms/', data)).toEqual({ files: ['docs/legal/terms.md'] });
  });

  it('returns null for unknown pages and docs sections', () => {
    expect(pageSource('/brand-new', data)).toBeNull();
    expect(pageSource('/docs/nope', data)).toBeNull();
  });
});

describe('statedDate', () => {
  it('reads the legal pages’ "Last updated" line', () => {
    expect(statedDate('_Last updated: 1 March 2027_')).toBe('2027-03-01');
    expect(statedDate('_Last updated: 15 September 2026_')).toBe('2026-09-15');
  });

  it('gives up on anything it can’t read', () => {
    expect(statedDate('_Last updated: 15 Smarch 2026_')).toBeNull();
    expect(statedDate('No date')).toBeNull();
  });
});

describe('createLastmod', () => {
  it('uses the newest commit for file-backed pages', () => {
    const git = vi.fn(() => '2026-10-12T23:32:34+01:00');
    const lastmod = createLastmod(data, git);
    expect(lastmod('https://sendm8.com/docs/ajax/')).toBe('2026-10-12T22:32:34.000Z');
    expect(git).toHaveBeenCalledWith(expect.arrayContaining(['web/src/components/docs/sections/Ajax.astro']));
  });

  it('passes stated dates through as-is', () => {
    expect(createLastmod(data, null)('https://sendm8.com/changelog/')).toBe('2026-09-16');
  });

  it('leaves lastmod out when git has no answer', () => {
    expect(createLastmod(data, null)('https://sendm8.com/pricing/')).toBeUndefined();
    expect(createLastmod(data, () => null)('https://sendm8.com/pricing/')).toBeUndefined();
  });

  it('warns about pages it doesn’t know', () => {
    const warn = vi.fn();
    expect(createLastmod(data, null, warn)('https://sendm8.com/brand-new/')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/brand-new/'));
  });
});

describe('gitDates', () => {
  it('returns nothing outside a repository', () => {
    expect(gitDates(tmpdir())).toBeNull();
  });

  it('reads real dates from a full clone, and refuses a shallow one', () => {
    // CI checks out one commit (shallow), local clones have full history; both must behave.
    const git = gitDates(root);
    if (git) expect(git(['web/src/lib/sitemap.ts', 'web/package.json'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    else expect(git).toBeNull();
  });

  it('fetches the full history of a shallow clone when asked, like a deploy build', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sitemap-'));
    try {
      // A two-commit repo, cloned one commit deep.
      const origin = join(dir, 'origin');
      const run = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
      mkdirSync(origin);
      run(origin, 'init', '-q');
      for (const [file, date] of [['a.txt', '2026-01-01T00:00:00Z'], ['b.txt', '2026-02-01T00:00:00Z']]) {
        writeFileSync(join(origin, file!), file!);
        run(origin, 'add', file!);
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', file!], {
          cwd: origin,
          stdio: 'ignore',
          env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
        });
      }
      const clone = join(dir, 'clone');
      run(dir, 'clone', '-q', '--depth', '1', pathToFileURL(origin).href, clone);

      expect(gitDates(clone)).toBeNull();
      const git = gitDates(clone, { unshallow: true });
      expect(git?.(['a.txt'])).toMatch(/^2026-01-01T/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
