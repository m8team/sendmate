/**
 * The changelog: one entry per shipped thing, newest first. Plain data, same pattern as
 * docsSections and compare — no CMS, no markdown pipeline. `body` paragraphs may contain
 * simple inline HTML (<code>, <a>) since they're authored by us, not user input.
 *
 * Dates and grouping are drawn from the real git history (`git log --format="%ad %s" --date=short`):
 * sendm8 launched in a single day (2026-09-15), with a couple of small commits the day after.
 */

export type ChangelogTag = 'Feature' | 'Fix' | 'Security' | 'Docs' | 'Perf';

export interface ChangelogEntry {
  /** Stable id: used as the #anchor and the RSS item link, so keep it once published. */
  slug: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  title: string;
  tags: ChangelogTag[];
  /** One line: the list teaser and the RSS/meta description. */
  summary: string;
  body: string[];
}

// Newest first. Entries sharing a date are ordered newest-first within that day too.
export const changelog: ChangelogEntry[] = [
  {
    slug: 'social-cards-sitemap-and-docs-pages',
    date: '2026-09-16',
    title: 'Social cards, a sitemap, and docs that stand on their own',
    tags: ['Feature', 'Docs'],
    summary:
      'Sharing a sendm8 link now shows a real card, every docs section has its own page, and there’s a sitemap plus structured data for search engines and AI assistants.',
    body: [
      'A link to sendm8.com dropped into Slack, Discord, Twitter or an iMessage thread now shows an actual card: the stamp mark, the pitch, and the one-line setup snippet, instead of a bare blue link. The favicon got PNG and ICO fallbacks too (16, 32, 180, 192, 512px, plus a proper <code>site.webmanifest</code>) for the places that don’t read the SVG one.',
      'Each section of the <a href="/docs">docs quickstart</a> — the basic form, AJAX, webhooks, moving from Formspree and the rest — now has its own page under <code>/docs/&lt;section&gt;</code>, with its own title and description, alongside the full one-page version for people who’d rather scroll than click.',
      'There’s a sitemap now, and <a href="/robots.txt">robots.txt</a> allows everything. Pages we don’t want indexed (the dashboard, system pages, an internal mockup index) carry a <code>noindex</code> tag instead of a <code>Disallow</code> line — a public list of “paths not to look at” is a gift to anyone with worse intentions than a search engine. Structured data (JSON-LD) went in too: an Organization/WebSite graph on every page, a SoftwareApplication block on the homepage declaring what it actually costs, and breadcrumbs on docs pages.',
    ],
  },
  {
    slug: 'llms-txt-and-formspree-guide',
    date: '2026-09-15',
    title: 'Docs for AI assistants, and a Formspree migration guide',
    tags: ['Docs'],
    summary: 'The docs are now published as Markdown at /llms.txt for AI assistants, plus a full guide for moving over from Formspree.',
    body: [
      'The quickstart is now published as clean Markdown at <a href="/llms.txt">/llms.txt</a> (and <a href="/llms-full.txt">/llms-full.txt</a>) for AI coding assistants to read directly, no HTML scraping required.',
      'And if you’re moving from Formspree: the <a href="/docs/formspree">migration guide</a> covers the URL change, which underscore fields carry over as-is, and <code>fetch</code>/React examples.',
    ],
  },
  {
    slug: 'operator-alerts-and-error-tracking',
    date: '2026-09-15',
    title: 'Behind the counter: operator alerts and Sentry-style error tracking',
    tags: ['Feature'],
    summary:
      'The team now hears about sign-ups, abuse flags and held submissions as they happen, and errors get grouped and surfaced in the admin panel instead of vanishing into a Worker log.',
    body: [
      'New accounts, new forms, abuse flags, held submissions and Resend failures now alert the team, and browser and Vue errors get reported and grouped by a small Sentry-style tracker built for this — surfaced in an admin panel section, no third-party bill required.',
    ],
  },
  {
    slug: 'file-uploads-and-ai-spam-scoring',
    date: '2026-09-15',
    title: 'File uploads and AI spam scoring, on by default',
    tags: ['Feature'],
    summary: 'R2 file uploads and Workers AI spam scoring turned on for every account, no credit card required.',
    body: [
      'File uploads (R2) and the AI spam score (Workers AI) are on by default for every account now, not behind an “add a card to unlock” wall — matching the rest of sendm8: free means free.',
      'The AI check runs after a submission is already stored, so it never slows down a real visitor waiting on a response.',
    ],
  },
  {
    slug: 'sendm8-launches',
    date: '2026-09-15',
    title: 'sendm8 is live: forms, a dashboard, and everywhere to send them',
    tags: ['Feature'],
    summary: 'The whole thing shipped in one day: a form endpoint with zero signup, a dashboard inbox, and delivery to email, Discord, Slack, Telegram and webhooks.',
    body: [
      'sendm8 launched: point any HTML form at <code>/f/you@example.com</code> with no account, or create a form in the dashboard for a private id, channels and settings. Submissions land in an inbox with search, star, filters and a spam folder.',
      'Delivery went out to email, Discord, Slack, Telegram and signed webhooks from day one, each with automatic retries and a “send test” button. Zero-signup forms confirm by email once, then can be claimed into a real account whenever you’re ready.',
      'Spam protection shipped in five layers — honeypot, rate limits, heuristics, a Turnstile challenge and AI scoring — plus a one-click self-host path. All of it AGPL-licensed, all of it on Cloudflare’s free plan.',
    ],
  },
];

export const changelogRoute = (slug: string) => `/changelog#${slug}`;
