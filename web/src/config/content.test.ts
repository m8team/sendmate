import { describe, expect, it } from 'vitest';
import { docsSections } from '../components/docs/sections/docsSections';
import { competitors, rows, us } from './compare';
import { guides, guideWordCount } from './guides';
import { site } from './site';
import { vsContent, vsFor } from './vs';

// The SEO pages make claims about sendm8 and about other services. These tests keep them to the
// rules they were written under: sourced, dated, the right length, and only linking to real pages.

describe('comparison data', () => {
  it('has a full row of cells for every service', () => {
    for (const c of [us, ...competitors]) expect(c.cells, c.name).toHaveLength(rows.length);
  });

  it('dates and sources every competitor, with https links', () => {
    for (const c of competitors) {
      expect(c.checkedOn, c.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.checkedOnLabel, c.name).toBeTruthy();
      expect(c.sources?.length, c.name).toBeGreaterThan(0);
      for (const s of c.sources!) expect(s.url, c.name).toMatch(/^https:\/\//);
    }
  });

  it('has a /vs page for every competitor, and nothing else', () => {
    expect(vsContent.map((v) => v.slug).sort()).toEqual(competitors.map((c) => c.slug).sort());
  });
});

describe('/vs pages', () => {
  for (const c of competitors) {
    const v = vsFor(c.slug!)!;
    it(`${c.name}: is complete and honest about when to pick them`, () => {
      // The page title is `sendm8 vs <name>: free, open-source alternative`, with no suffix.
      expect(`sendm8 vs ${c.name}: free, open-source alternative`.length).toBeLessThanOrEqual(60);
      expect(v.description.length).toBeGreaterThanOrEqual(120);
      expect(v.description.length).toBeLessThanOrEqual(160);
      expect(v.highlights).toHaveLength(3);
      expect(v.pickThemIf.length).toBeGreaterThanOrEqual(2);
      expect(v.faq.length).toBeGreaterThanOrEqual(3);
      expect(v.switching.notes.length).toBeGreaterThan(0);
      // The "after" snippet is sendm8; the "before" isn't.
      expect(v.switching.after.code).toContain(site.endpointBase);
      expect(v.switching.before.code).not.toContain(site.endpointBase);
    });
  }
});

describe('guides', () => {
  const docIds = new Set<string>(docsSections.map((s) => s.id));
  const vsSlugs = new Set(competitors.map((c) => c.slug));

  it('have unique slugs and titles', () => {
    expect(new Set(guides.map((g) => g.slug)).size).toBe(guides.length);
    expect(new Set(guides.map((g) => g.title)).size).toBe(guides.length);
  });

  for (const g of guides) {
    it(`${g.slug}: has a title that fits in search results`, () => {
      expect(`${g.title} · sendm8`.length).toBeLessThanOrEqual(60);
    });

    it(`${g.slug}: is 400–800 words with a sound description`, () => {
      const words = guideWordCount(g);
      expect(words).toBeGreaterThanOrEqual(400);
      expect(words).toBeLessThanOrEqual(800);
      expect(g.description.length).toBeGreaterThanOrEqual(120);
      expect(g.description.length).toBeLessThanOrEqual(160);
      expect(g.faq.length).toBeGreaterThanOrEqual(3);
    });

    it(`${g.slug}: links only to docs and /vs pages that exist`, () => {
      for (const id of g.related.docs) expect(docIds.has(id), id).toBe(true);
      for (const slug of g.related.vs) expect(vsSlugs.has(slug), slug).toBe(true);
      const html = g.blocks.flatMap((b) => ('p' in b ? [b.p] : 'steps' in b ? b.steps : 'note' in b ? [b.note] : [])).join(' ');
      for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
        if (href!.startsWith('/guides/')) expect(guides.some((x) => href === `/guides/${x.slug}/`), href).toBe(true);
        if (href!.startsWith('/docs/')) expect(docIds.has(href!.split('/')[2]!), href).toBe(true);
      }
    });

    it(`${g.slug}: has a working form snippet aimed at sendm8`, () => {
      const code = g.blocks.flatMap((b) => ('code' in b ? [b.code] : [])).join('\n');
      expect(code).toMatch(/action=|fetch\(|formEndpoint/);
      expect(code).toContain(site.endpointBase);
    });
  }
});
