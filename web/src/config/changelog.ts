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
    slug: 'fifty-instant-emails',
    date: '2026-11-23',
    title: '50 instant emails a day, up from 10',
    tags: ['Feature'],
    summary: 'Each account now gets 50 instant notification emails a day before the rest go into the daily digest, and the site header knows when you’re signed in.',
    body: [
      'sendm8.com now sends through a bigger Resend plan, so the instant email limit went from 10 a day per account to 50. Anything over that still arrives in your daily digest, and Discord, Slack, Telegram and webhooks were never limited. Every page that quotes the limit is built from the same numbers the server enforces, so they can’t disagree.',
      'If you’re signed in, the header now says Dashboard instead of Sign in, and opening the sign-in page takes you straight to the dashboard. Signing in from a page now brings you back to it afterwards.',
      'Self-hosting is unchanged: the defaults still fit inside Cloudflare’s and Resend’s free plans, and the Docker image starts on them too.',
    ],
  },
  {
    slug: 'formspree-alternatives-guide',
    date: '2026-11-23',
    title: 'A plain guide to Formspree alternatives',
    tags: ['Docs'],
    summary: 'Free form backends compared from their own pricing pages, sendm8 included and labelled as ours, and an llms.txt that opens with a form you can paste in.',
    body: [
      '<a href="/guides/best-formspree-alternatives/">The best Formspree alternatives</a> compares the free plans of Web3Forms, FormSubmit, Netlify Forms, Basin, Forminit, Formspark, Tally and others, with a source link for every figure, quick picks by what you need, and the open-source projects you can host yourself.',
      '<a href="/llms.txt">llms.txt</a> now starts with a working contact form that needs no account, so an AI assistant can paste it in as-is.',
    ],
  },
  {
    slug: 'quieter-faster-dashboard',
    date: '2026-11-21',
    title: 'A quieter, faster dashboard',
    tags: ['Feature', 'Perf'],
    summary: 'The dashboard is plainer and quicker: pages switch without reloading, data you’ve seen shows instantly, and the inbox, forms and settings were simplified.',
    body: [
      'Moving around the dashboard no longer reloads the page, and anything you’ve already loaded appears straight away while it refreshes in the background.',
      'The inbox list has more room and no unread dots, and a submission opens as one column that leads with who sent it and what they said. Forms are a plain table, nested under Forms in the side rail, and creating one is a three-step page. Form settings and the Email sending page were trimmed down, with who gets emails first.',
      'There’s also a one-question “How did you hear about sendm8?” box in the dashboard. You can skip it.',
    ],
  },
  {
    slug: 'new-spam-model-and-phishing-rule',
    date: '2026-11-20',
    title: 'A new spam model, and a rule for marketplace phishing',
    tags: ['Fix', 'Security'],
    summary: 'Cloudflare retired the AI model behind the spam check, so it moved to Llama 3.3 70B. A new rule now catches “your item sold, verify to get paid” phishing even without the AI.',
    body: [
      'Cloudflare retired the Llama 3.1 8B model on 20 November, and the AI spam check stopped scoring for most of that day. The rules and honeypots kept running. It now uses Llama 3.3 70B, picked after testing the candidates against real past submissions: it caught the same bot spam and stopped flagging ordinary Persian and Chinese enquiries.',
      'A new rule bins the marketplace phishing lure (“your Vinted item sold, verify your profile to release the funds”) whenever it comes with a link, whether or not the AI check is available.',
      'If a form is disabled for abuse, anything still waiting for its daily digest is no longer sent.',
    ],
  },
  {
    slug: 'bounce-handling',
    date: '2026-11-17',
    title: 'No more emailing addresses that bounce',
    tags: ['Feature'],
    summary: 'When an email hard-bounces or is marked as spam, sendm8 stops sending to that address and tags it as Bounced in your settings.',
    body: [
      'If a notification to one of your addresses hard-bounces, or the recipient marks it as spam, sendm8 now stops emailing that address instead of trying again and again, which protects delivery for everyone. The address is tagged Bounced in <strong>Email &amp; BYOK</strong>, so you can see why emails stopped. Your other delivery channels carry on as normal.',
      'Self-hosters can turn this on with a Resend webhook; the <a href="https://github.com/m8team/sendmate/blob/main/docs/self-hosting.md">self-hosting guide</a> explains how.',
    ],
  },
  {
    slug: 'limit-warnings-and-fairer-ai-check',
    date: '2026-11-14',
    title: 'Warnings before the monthly cap, and a fairer spam check',
    tags: ['Feature', 'Fix'],
    summary: 'No-account forms now warn their owner before they hit the monthly cap, and the AI spam check can no longer bin non-English messages or short sign-ups on its own.',
    body: [
      'A form with no account emails its owner when it passes 80% of the monthly submission cap, and again if it reaches it, so a busy campaign doesn’t start turning people away unnoticed. Signing in with the same address lifts the cap.',
      'The AI check misjudged a few kinds of genuine submission, so it can now flag them but not bin them by itself: messages mostly in a non-Latin script, and sign-ups made of short structured answers (a name, a phone number, a ticket count). Bot spam that pairs a Latin name with Russian text is still caught.',
      'Throwaway inbox domains are now refused more reliably, including new domains from the big providers.',
    ],
  },
  {
    slug: 'confirmation-reminders',
    date: '2026-11-10',
    title: 'Clearer confirmation for no-account forms',
    tags: ['Feature'],
    summary: 'A form waiting for its owner to confirm now says so, and the owner gets one reminder if messages are waiting.',
    body: [
      'When someone submits a <code>/f/you@example.com</code> form whose owner hasn’t clicked the confirmation link yet, the response now says the message is stored and waiting, and the thank-you page and the <a href="/docs/ajax-helper/">helper script</a> explain it in plain words. The JSON response includes <code>"pending": "confirmation"</code>.',
      'If messages are waiting and the link still hasn’t been clicked after three days, the owner gets one reminder. Reminders only go to endpoints a real website posted to.',
      'Email endpoints now refuse posts that claim to come from sendm8.com itself (<code>400 invalid_origin</code>).',
    ],
  },
  {
    slug: 'new-homepage',
    date: '2026-11-02',
    title: 'A new homepage',
    tags: ['Feature'],
    summary: 'The homepage now leads with the whole idea: one line of HTML in, mail out. The logo’s 8 is the new favicon.',
    body: [
      'The <a href="/">homepage</a> was rebuilt around the one line of HTML that sets up a form. The 8 from the logo is now the favicon.',
    ],
  },
  {
    slug: 'verify-an-address-to-claim-its-forms',
    date: '2026-10-29',
    title: 'Verify an address to claim its forms',
    tags: ['Feature'],
    summary: 'Verifying another email address in your account now brings any no-signup forms sent to it into your dashboard.',
    body: [
      'If you’ve been using <code>/f/</code> endpoints with a work address but signed in with a personal one, add the work address under <strong>Email &amp; BYOK</strong> and verify it. Its forms and their submissions move into your account. An empty dashboard now asks whether your form sends to a different address, and links straight there.',
    ],
  },
  {
    slug: 'docker-self-hosting',
    date: '2026-10-28',
    title: 'Run sendm8 in Docker, no Cloudflare account needed',
    tags: ['Feature'],
    summary: 'sendm8 now runs in a single Docker container, on the same runtime Cloudflare uses, with its database and files on a local volume.',
    body: [
      'There’s now a <a href="https://github.com/m8team/sendmate/blob/main/docs/self-hosting.md#docker">Docker image</a> for running your own copy anywhere. It uses the same runtime as Cloudflare, keeps the database and uploaded files on a volume, and runs the scheduled jobs itself. The one thing it leaves out is the AI spam check, which only runs on Cloudflare; the honeypot, rules and Turnstile all work.',
      'It suits personal and small-team use. For a busy public instance, deploying to Cloudflare is still the better home.',
    ],
  },
  {
    slug: 'guides-and-comparisons',
    date: '2026-10-28',
    title: 'Guides for static sites, and honest comparisons',
    tags: ['Docs'],
    summary:
      'Step-by-step guides for GitHub Pages, Astro, Hugo, Jekyll, Eleventy, Next.js and plain HTML, sending forms to Discord, Slack, Telegram and webhooks, and re-checked comparisons with Formspree, Web3Forms, FormSubmit and Getform.',
    body: [
      'There’s a <a href="/guides/">guide</a> for each common static-site setup, each starting with a form you can paste in and test, plus guides to sending submissions to <a href="/guides/html-form-to-discord/">Discord</a>, <a href="/guides/html-form-to-slack/">Slack</a>, <a href="/guides/html-form-to-telegram/">Telegram</a> and <a href="/guides/html-form-to-webhook/">your own webhook</a>. <a href="/form-to-email/">Form to email</a> covers the basics on one page.',
      'The comparison pages were re-checked against each service’s own pricing and docs, and now show the date they were checked. Getform, which renamed itself Forminit in January, has a <a href="/vs/getform/">page of its own</a>. Each page also says when you’d be better off with the other service, and shows how to switch with before-and-after code.',
    ],
  },
  {
    slug: 'social-cards-sitemap-and-docs-pages',
    date: '2026-09-16',
    title: 'Social cards, a sitemap, and docs that stand on their own',
    tags: ['Feature', 'Docs'],
    summary:
      'Sharing a sendm8 link now shows a real card, every docs section has its own page, and there’s a sitemap plus structured data for search engines and AI assistants.',
    body: [
      'A link to sendm8.com dropped into Slack, Discord, Twitter or an iMessage thread now shows an actual card: the stamp mark, the pitch, and the one-line setup snippet, instead of a bare blue link. The favicon got PNG and ICO fallbacks too (16, 32, 180, 192, 512px, plus a proper <code>site.webmanifest</code>) for the places that don’t read the SVG one.',
      'Each section of the <a href="/docs/">docs quickstart</a> — the basic form, AJAX, webhooks, moving from Formspree and the rest — now has its own page under <code>/docs/&lt;section&gt;</code>, with its own title and description, alongside the full one-page version for people who’d rather scroll than click.',
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
      'And if you’re moving from Formspree: the <a href="/docs/formspree/">migration guide</a> covers the URL change, which underscore fields carry over as-is, and <code>fetch</code>/React examples.',
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

export const changelogRoute = (slug: string) => `/changelog/#${slug}`;
