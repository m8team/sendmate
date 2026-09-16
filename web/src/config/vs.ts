/**
 * Narrative copy for the /vs/<slug> pages — one per competitor in config/compare.ts.
 * The facts here must match the numbers in compare.ts; this file is the prose around them.
 */

export interface VsFaq {
  q: string;
  a: string;
}

export interface VsContent {
  slug: string;
  /** Shown in the hero, under the h1. */
  intro: string;
  /** Three short, specific differences — not generic marketing lines. */
  highlights: string[];
  migration: {
    title: string;
    body: string;
    cta: { label: string; href: string };
  };
  faq: VsFaq[];
}

export const vsContent: VsContent[] = [
  {
    slug: 'formspree',
    intro:
      'Formspree needs an account before your form works at all, and the free plan caps out at 50 submissions a month. sendm8 works the moment you paste a URL — no account, and 1,000 submissions a form before you’d even think about it.',
    highlights: [
      '1,000 free submissions a month, not 50.',
      'No account needed to start: your email address in the URL is the whole setup.',
      'The source is public and self-hostable under AGPL-3.0 — Formspree’s isn’t available.',
    ],
    migration: {
      title: 'Moving from Formspree takes one line',
      body: 'Change the form’s action URL to your sendm8 endpoint. The Formspree-compatible fields — _replyto, _subject, _next, _gotcha and _cc — work the same way, so the rest of the form doesn’t need to change.',
      cta: { label: 'Read the Formspree migration guide', href: '/docs/formspree' },
    },
    faq: [
      {
        q: 'Is sendm8 free forever, or is there a paid plan I’ll eventually need?',
        a: 'There’s no paid plan to hit. 1,000 submissions a month per form, on up to 100 forms, free — the same limits for every account.',
      },
      {
        q: 'Will switching from Formspree break my existing form fields?',
        a: 'No. The underscore fields Formspree popularised — _replyto, _subject, _next, _gotcha and _cc — work the same way on sendm8, so most forms only need the action URL changed.',
      },
    ],
  },
  {
    slug: 'web3forms',
    intro:
      'Web3Forms’ free plan gives you 250 submissions a month and needs an email-verified access key before anything is delivered. sendm8 gives you 1,000 submissions a form, and the zero-signup endpoint works with nothing but your email address in the URL.',
    highlights: [
      '1,000 free submissions a month, not 250.',
      'Discord, Slack and Telegram delivery included free — Web3Forms keeps those on paid plans.',
      'The source is public and self-hostable under AGPL-3.0; Web3Forms doesn’t list either.',
    ],
    migration: {
      title: 'Switching over',
      body: 'There’s no dedicated migration guide since it’s a straight swap: point the form’s action at your sendm8 endpoint instead of Web3Forms’ access-key URL. The basic form docs cover React, Vue, Astro and Next.js examples if you need them.',
      cta: { label: 'See the basic form docs', href: '/docs/basic-form' },
    },
    faq: [
      {
        q: 'Do I need to verify an email address to get an access key, like Web3Forms?',
        a: 'No — a sendm8 endpoint works immediately with your email address in the URL. You confirm ownership once, by clicking a link in the first email, and every submission after that is delivered.',
      },
      {
        q: 'Can I still send submissions to Discord or Slack on the free plan?',
        a: 'Yes, unlimited, on every account — it’s not a paid-plan feature on sendm8.',
      },
    ],
  },
  {
    slug: 'formsubmit',
    intro:
      'FormSubmit is the closest match to sendm8’s no-signup pitch — unlimited free submissions, email in the URL, no account. Where sendm8 differs is what happens after: a dashboard inbox with search and export, Discord, Slack and Telegram delivery, and a public source you can self-host.',
    highlights: [
      'A dashboard inbox with search, star, filters and CSV/JSON export — FormSubmit’s history is API-only, capped at 5 calls a day, with no dashboard.',
      'Discord, Slack and Telegram delivery, not just webhooks.',
      'Open source and self-hostable under AGPL-3.0, with the same code running sendm8.com.',
    ],
    migration: {
      title: 'Switching over',
      body: 'Same shape, one line: swap the form’s action for your sendm8 endpoint. FormSubmit’s own special fields don’t carry over 1:1, so check the basic form and special fields docs for the sendm8 equivalents.',
      cta: { label: 'See the basic form docs', href: '/docs/basic-form' },
    },
    faq: [
      {
        q: 'Does sendm8 have a submission limit, unlike FormSubmit’s unlimited free plan?',
        a: 'Yes — 1,000 stored submissions a month per form. FormSubmit doesn’t cap submissions, but also doesn’t keep a dashboard history of them; sendm8 trades an upper limit for search, filters and export.',
      },
      {
        q: 'Is there a dashboard, or is it API-only like FormSubmit?',
        a: 'There’s a full dashboard inbox — search, star, filters, a spam folder, and CSV/JSON export — not just an API.',
      },
    ],
  },
];

export const vsFor = (slug: string) => vsContent.find((v) => v.slug === slug);
