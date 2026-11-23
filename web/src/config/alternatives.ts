import { LIMITS } from './limits';
import { fmt, limits, site } from './site';

/**
 * Facts for /guides/best-formspree-alternatives/, read from each service's own pricing page, docs or
 * repo on the date below. Only write what a linked source says; where a vendor's pages disagree or
 * don't say, the copy says so. Re-check every source when you change `checkedOn`.
 */
export const alternativesCheckedOn = '2026-11-23';
export const alternativesCheckedOnLabel = '23 Nov 2026';

export interface Alternative {
  name: string;
  url: string;
  /** Marks sendm8's own entry, so the page can say so plainly. */
  ours?: boolean;
  /** Our /vs/<slug> page, when there is one. */
  vs?: string;
  freeSubmissions: string;
  account: string;
  uploads: string;
  webhooks: string;
  paid: string;
  openSource: string;
  /** One or two sentences: what it is and who it suits. Plain text. */
  summary: string;
  pickIf: string;
  watchOut: string;
  sources: { label: string; url: string }[];
}

export const hostedAlternatives: Alternative[] = [
  {
    name: 'Web3Forms',
    url: 'https://web3forms.com',
    vs: 'web3forms',
    freeSubmissions: '250 a month',
    account: 'No: an access key is emailed to you',
    uploads: 'No (paid)',
    webhooks: 'No (paid)',
    paid: 'Pro $16/mo, billed yearly',
    openSource: 'No',
    summary:
      'The most common recommendation for a static-site contact form. You put a public access key in a hidden field and submissions are emailed to you, with 30 days of history on the free plan.',
    pickIf: 'You want a well-known service with a bigger free allowance than Formspree and only need email.',
    watchOut: 'File uploads, webhooks, every integration, reCAPTCHA and Turnstile are paid features.',
    sources: [
      { label: 'pricing', url: 'https://web3forms.com/pricing' },
      { label: 'pro features', url: 'https://docs.web3forms.com/getting-started/pro-features.md' },
    ],
  },
  {
    name: 'FormSubmit',
    url: 'https://formsubmit.co',
    vs: 'formsubmit',
    freeSubmissions: 'Unlimited, per its docs',
    account: 'No: your email goes in the action URL',
    uploads: 'Yes, 10 MB per form, not kept',
    webhooks: 'Yes',
    paid: 'No paid plan listed',
    openSource: 'Not stated',
    summary:
      'The simplest setup there is: put your email address in the form action, confirm it once, and submissions arrive by email. It also supports webhooks and a honeypot.',
    pickIf: 'You want a form working in a minute and don’t need a dashboard.',
    watchOut:
      'Your address sits in the page HTML until you swap it for the random string it gives you. Submissions are kept for 30 days and the API allows 5 calls a day.',
    sources: [
      { label: 'home', url: 'https://formsubmit.co/' },
      { label: 'documentation', url: 'https://formsubmit.co/documentation' },
    ],
  },
  {
    name: 'Netlify Forms',
    url: 'https://www.netlify.com/platform/core/forms/',
    freeSubmissions: 'Unlimited on credit-based plans',
    account: 'Netlify account and a Netlify-hosted site',
    uploads: 'Yes, 8 MB per request',
    webhooks: 'Netlify notifications',
    paid: 'Forms cost no credits',
    openSource: 'No',
    summary:
      'Built into Netlify hosting: add data-netlify="true" to a form and Netlify picks it up at deploy time, with Akismet spam filtering included.',
    pickIf: 'Your site is already on Netlify.',
    watchOut:
      'It only works for sites deployed on Netlify. Older accounts on legacy plans start at 100 submissions and 10 MB of uploads a month.',
    sources: [
      { label: 'forms usage and billing', url: 'https://docs.netlify.com/manage/forms/usage-and-billing/' },
      { label: 'forms setup', url: 'https://docs.netlify.com/manage/forms/setup/' },
    ],
  },
  {
    name: 'Static Forms',
    url: 'https://www.staticforms.dev',
    freeSubmissions: '250 a month',
    account: 'Yes: free signup for an API key',
    uploads: 'No (paid)',
    webhooks: 'No (Pro, $9/mo)',
    paid: 'Starter $6/mo',
    openSource: 'Not stated',
    summary:
      'An API key in a hidden field, email delivery and reCAPTCHA v2 on the free plan, with an inbox showing the last 30 days. It has moved from staticforms.xyz to staticforms.dev.',
    pickIf: 'You want 250 a month and a cheap upgrade path.',
    watchOut: 'The free plan is email only, with no uploads or webhooks.',
    sources: [{ label: 'pricing', url: 'https://www.staticforms.dev/pricing' }],
  },
  {
    name: 'FormBold',
    url: 'https://formbold.com',
    freeSubmissions: '250 a month',
    account: 'Yes',
    uploads: 'No (paid)',
    webhooks: 'No (Starter)',
    paid: 'Starter $6/mo, billed yearly',
    openSource: 'Not stated',
    summary: 'A hosted endpoint with up to 10 forms, a spam filter and reCAPTCHA on the free plan, and a dashboard of saved submissions.',
    pickIf: 'You want several forms on 250 a month.',
    watchOut: 'Slack, webhooks, Zapier and file storage start on the paid plan.',
    sources: [{ label: 'pricing', url: 'https://formbold.com/pricing' }],
  },
  {
    name: 'Forminit (formerly Getform)',
    url: 'https://forminit.com',
    vs: 'getform',
    freeSubmissions: '100 a month, 1 form',
    account: 'Yes',
    uploads: 'Yes, 100 MB storage',
    webhooks: 'No (Pro)',
    paid: 'Pro $16/mo',
    openSource: 'No',
    summary: 'Getform renamed itself Forminit in January 2026. The free plan keeps submissions until you delete them and accepts file uploads.',
    pickIf: 'You need file uploads on a free plan for a single form.',
    watchOut: 'One form on the free plan, and webhooks, the API and integrations are Pro.',
    sources: [{ label: 'pricing', url: 'https://forminit.com/pricing' }],
  },
  {
    name: 'Basin',
    url: 'https://usebasin.com',
    vs: 'basin',
    freeSubmissions: '50 a month, 1 form',
    account: 'Yes',
    uploads: 'Yes, 100 MB storage',
    webhooks: 'Zapier only; webhooks from Growth',
    paid: 'Starter $12.50/mo, billed yearly',
    openSource: 'No',
    summary: 'A developer-focused form backend with file uploads and a Zapier integration on the free plan. Spam doesn’t count towards the quota.',
    pickIf: 'You need uploads and Zapier, and 50 a month is enough.',
    watchOut: 'The free plan has the same 50 a month as Formspree, with one form and 30-day retention.',
    sources: [{ label: 'pricing', url: 'https://usebasin.com/pricing' }],
  },
  {
    name: 'Formcarry',
    url: 'https://formcarry.com',
    freeSubmissions: '50 a month, 1 form',
    account: 'Yes',
    uploads: 'Unclear: its pages disagree',
    webhooks: 'Not clearly stated',
    paid: 'Starter $6/mo',
    openSource: 'No',
    summary: 'A hosted endpoint that keeps submissions indefinitely, with a REST API and an MCP server for AI assistants.',
    pickIf: 'You want submissions stored forever and a cheap first paid tier.',
    watchOut: 'The homepage says uploads are paid-only while the pricing card lists them on free, so check before relying on them.',
    sources: [
      { label: 'pricing', url: 'https://formcarry.com/pricing' },
      { label: 'home', url: 'https://formcarry.com/' },
    ],
  },
  {
    name: 'Formspark',
    url: 'https://formspark.io',
    freeSubmissions: '250 in total, not per month',
    account: 'Yes',
    uploads: 'Links only, via Uploadcare or similar',
    webhooks: 'Yes, plus Slack and Zapier',
    paid: '$25 once for 50,000 submissions',
    openSource: 'No',
    summary: 'You buy submissions in bundles that never expire instead of paying monthly. Webhooks, Slack and Zapier are on the free plan.',
    pickIf: 'Your form gets a few submissions a month and you’d rather pay once.',
    watchOut: 'The free 250 is a one-off allowance, and files have to go through a third-party upload service.',
    sources: [
      { label: 'pricing', url: 'https://formspark.io/pricing/' },
      { label: 'limits', url: 'https://documentation.formspark.io/troubleshooting/limits-and-plans.html' },
    ],
  },
  {
    name: 'Tally',
    url: 'https://tally.so',
    freeSubmissions: 'Unlimited, under fair use',
    account: 'Yes',
    uploads: 'Yes, 10 MB a file',
    webhooks: 'Yes, plus Sheets, Notion and Zapier',
    paid: 'Pro $24/mo',
    openSource: 'No',
    summary: 'Not a backend for your own HTML: Tally is a hosted form builder whose forms you link to or embed. Its free plan is very generous.',
    pickIf: 'You’d rather build the form in Tally than write the HTML yourself.',
    watchOut: 'The form is Tally’s page, styled within Tally’s options, not markup on your site.',
    sources: [{ label: 'pricing', url: 'https://tally.so/pricing' }],
  },
];

export const sendm8Alternative: Alternative = {
  name: 'sendm8',
  url: site.url,
  ours: true,
  freeSubmissions: `${fmt.n(limits.submissionsPerFormPerMonth)} a month per form`,
  account: `No: your email goes in the action URL (${fmt.n(LIMITS.submissionsPerUnclaimedFormPerMonth)} a month until you sign in)`,
  uploads: `Yes, ${limits.fileUploadMb} MB a file`,
  webhooks: 'Yes, plus Discord, Slack and Telegram',
  paid: 'No paid plan',
  openSource: `Yes, ${site.license}`,
  summary: `This is us. Put your email in the action URL and submissions are emailed to you with no account, or sign in for a dashboard, CSV export, spam filtering and delivery to Discord, Slack, Telegram or signed webhooks. It runs on Cloudflare and you can host your own copy.`,
  pickIf: 'You want no signup to start, a generous free allowance, webhooks and uploads without paying, or a backend you can self-host.',
  watchOut: `We’re new and small. Email notifications through our sender are limited to ${limits.emailsPerDay} a day per account; the rest arrive in a daily digest, unless you connect your own Resend key.`,
  sources: [
    { label: 'pricing and limits', url: `${site.url}/pricing/` },
    { label: 'source code', url: site.repo },
  ],
};

export interface OpenSourceAlternative {
  name: string;
  repo: string;
  licence: string;
  stack: string;
  lastCommit: string;
  note: string;
}

export const selfHosted: OpenSourceAlternative[] = [
  {
    name: 'OSForms',
    repo: 'https://github.com/hawkeye-sama/osforms',
    licence: 'MIT',
    stack: 'Next.js, MongoDB, Docker Compose',
    lastCommit: '16 Nov 2026',
    note: 'Sends email through your own Resend account and syncs to Google Sheets. Its self-hosting guide notes that sign-up codes can’t be emailed from a self-hosted copy yet.',
  },
  {
    name: 'Formgrid',
    repo: 'https://github.com/allenarduino/formgrid',
    licence: 'MIT',
    stack: 'Node.js, React, MySQL, Docker',
    lastCommit: '13 Oct 2026',
    note: 'File uploads to local disk, MinIO, S3 or GCS, plus webhooks, a honeypot and reCAPTCHA. Also offered hosted at formgrid.dev.',
  },
  {
    name: 'FormTo',
    repo: 'https://github.com/lumizone/formto',
    licence: 'MIT',
    stack: 'Fastify, React, PostgreSQL, Caddy, Docker Compose',
    lastCommit: '19 May 2026',
    note: 'An inbox with Telegram, Slack and webhooks. No commits for about six months, and its website didn’t resolve when we checked.',
  },
];
