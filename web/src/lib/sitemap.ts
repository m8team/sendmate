/**
 * What goes in /sitemap-0.xml and when each page last changed. astro.config.mjs feeds this to
 * @astrojs/sitemap.
 *
 * `<lastmod>` is the only optional sitemap tag Google still reads (it ignores priority and changefreq),
 * and only from sites whose dates prove accurate. So each page lists the files its own content comes
 * from, and its date is the newest commit to any of them. Layouts, the header and the footer are left
 * out on purpose: a footer tweak doesn't make every page "new". When git can't give a true date (no git,
 * or a shallow clone where every file looks changed by the last commit), lastmod is left out, because
 * no date beats a wrong one.
 */
import { execFileSync } from 'node:child_process';

/** Routes that carry <meta name="robots" content="noindex">, so they stay out of the sitemap too. */
export const NOINDEX_PREFIXES = ['/app', '/pages', '/confirm', '/blocked', '/thanks', '/c', '/404'];

export const isIndexable = (pathname: string) =>
  !NOINDEX_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/** A page's date comes from git history of these files (repo-relative), or is stated outright. */
export type PageSource = { files: string[] } | { date: string };

const WEB = 'web/src';

/** The component each /docs/<id> page mounts (see src/pages/docs/[id].astro). */
export const docsSectionFiles: Record<string, string> = {
  'basic-form': 'BasicForm.astro',
  'zero-signup': 'ZeroSignup.astro',
  fields: 'SpecialFields.astro',
  ajax: 'Ajax.astro',
  'ajax-helper': 'AjaxHelper.astro',
  redirects: 'Redirects.astro',
  spam: 'SpamProtection.astro',
  uploads: 'FileUploads.astro',
  discord: 'ConnectDiscord.astro',
  byok: 'ConnectResend.astro',
  webhooks: 'Webhooks.astro',
  formspree: 'Formspree.astro',
};

export interface SitemapData {
  /** Newest changelog entry's date, yyyy-mm-dd. */
  changelogDate: string;
  /** Raw Markdown of the legal pages, which state their own "Last updated" date. */
  legal: { privacy: string; terms: string };
}

/** Where a page's content lives, or null for a page this file doesn't know about yet. */
export function pageSource(pathname: string, data: SitemapData): PageSource | null {
  const path = pathname.replace(/\/+$/, '') || '/';

  switch (path) {
    case '/':
      return { files: [`${WEB}/pages/index.astro`, `${WEB}/components/home`, `${WEB}/config/compare.ts`, `${WEB}/config/snippets.ts`] };
    case '/pricing':
      return { files: [`${WEB}/pages/pricing.astro`, `${WEB}/components/pricing`] };
    case '/changelog':
      return { date: data.changelogDate };
    case '/emails':
      return { files: [`${WEB}/pages/emails.astro`, 'web/public/emails/new-submission.html'] };
    case '/docs':
      return { files: [`${WEB}/pages/docs/index.astro`, `${WEB}/components/docs`] };
    case '/privacy':
    case '/terms': {
      const date = statedDate(data.legal[path.slice(1) as 'privacy' | 'terms']);
      return date ? { date } : { files: [`docs/legal${path}.md`] };
    }
  }

  const docs = path.match(/^\/docs\/([a-z0-9-]+)$/);
  if (docs) {
    const file = docsSectionFiles[docs[1]!];
    if (!file) return null;
    const sections = `${WEB}/components/docs/sections`;
    return { files: [`${WEB}/pages/docs/[id].astro`, `${sections}/${file}`, `${sections}/docsSections.ts`] };
  }

  if (/^\/vs\/[a-z0-9-]+$/.test(path)) {
    return { files: [`${WEB}/pages/vs/[slug].astro`, `${WEB}/config/vs.ts`, `${WEB}/config/compare.ts`, `${WEB}/components/home/Compare.astro`] };
  }

  return null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** The `_Last updated: 15 September 2026_` line in a legal page, as yyyy-mm-dd. */
export function statedDate(markdown: string): string | null {
  const match = markdown.match(/_Last updated: (\d{1,2}) ([A-Za-z]+) (\d{4})_/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2]!.toLowerCase());
  if (month < 0) return null;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString().slice(0, 10);
}

/** Newest commit date (ISO 8601) touching any of `files`, or null. */
export type GitDate = (files: string[]) => string | null;

/**
 * Reads commit dates from the repo at `root`. Returns null when there's no usable history: git missing,
 * not a repo, or a shallow clone, where the cut-off commit looks like it changed every file.
 *
 * Cloudflare's deploy builds clone shallowly, so with `unshallow` a shallow clone first fetches its full
 * history. That's a network call that changes the checkout, so only the build asks for it.
 */
export function gitDates(root: string, { unshallow = false } = {}): GitDate | null {
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 }).trim();
  const shallow = () => git(['rev-parse', '--is-shallow-repository']) !== 'false';
  try {
    if (shallow()) {
      if (!unshallow) return null;
      git(['fetch', '--unshallow', '--quiet']);
      if (shallow()) return null;
    }
  } catch {
    return null;
  }
  return (files) => {
    try {
      return git(['log', '-1', '--format=%cI', '--', ...files]) || null;
    } catch {
      return null;
    }
  };
}

/** Builds the lastmod lookup: a full page URL in, an ISO date (or undefined) out. */
export function createLastmod(data: SitemapData, gitDate: GitDate | null, warn: (message: string) => void = console.warn) {
  return (url: string): string | undefined => {
    const pathname = new URL(url).pathname;
    const source = pageSource(pathname, data);
    if (!source) {
      warn(`sitemap: no lastmod source for ${pathname}. Add it to pageSource() in src/lib/sitemap.ts.`);
      return undefined;
    }
    // Stated dates have no time of day, and W3C datetime allows a bare yyyy-mm-dd.
    if ('date' in source) return source.date;
    const date = gitDate?.(source.files);
    return date ? new Date(date).toISOString() : undefined;
  };
}
