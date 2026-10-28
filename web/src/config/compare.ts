import { LIMITS } from '@sendm8/shared';
import { limits, fmt, site } from './site';

/**
 * Free-plan facts, checked by hand against each service's own pricing page and docs.
 * Keep this honest: only write what a linked source says. If you can't confirm a cell,
 * say so in its note rather than guessing. Update a competitor's `sources` and `checkedOn`
 * whenever you re-check it; the /vs pages show that date.
 */
/** The most recent check of any competitor, for the homepage table. */
export const checkedOn = '2026-10-28';
export const checkedOnLabel = '28 Oct 2026';

export type Cell = { v: string; tone?: 'yes' | 'no' | 'part'; note?: string };
export type Source = { label: string; url: string };

export interface Competitor {
  name: string;
  /** URL slug for its /vs/<slug> page. Only set on actual competitors — `us` has no such page. */
  slug?: string;
  note?: string;
  cells: Cell[];
  sources?: Source[];
  /** When `sources` were last read, yyyy-mm-dd, and how to show it. */
  checkedOn?: string;
  checkedOnLabel?: string;
}

export const rows = [
  'Free submissions / month',
  'Forms',
  'Works without signing up',
  'Stored submissions + export',
  'Webhooks + chat apps',
  'File uploads',
  'Custom redirect',
  'Open source, self-hostable',
  'Cheapest paid plan',
] as const;

export const us: Competitor = {
  name: 'sendm8',
  cells: [
    {
      v: `${fmt.n(limits.submissionsPerFormPerMonth)} per form`,
      tone: 'yes',
      note: `Email: ${limits.emailsPerDay} instant a day, then a daily digest`,
    },
    { v: `Up to ${fmt.n(limits.forms)}`, tone: 'yes' },
    {
      v: 'Yes, email in the URL',
      tone: 'yes',
      note: `${fmt.n(LIMITS.submissionsPerUnclaimedFormPerMonth)}/month until you claim the form`,
    },
    { v: 'Dashboard, CSV + JSON', tone: 'yes' },
    { v: 'Webhooks, Discord, Slack, Telegram', tone: 'yes', note: 'Unlimited' },
    { v: `${limits.fileUploadMb} MB a file`, tone: 'yes', note: `${limits.submissionUploadMb} MB a submission` },
    { v: 'Yes', tone: 'yes' },
    { v: `Yes, ${site.license}`, tone: 'yes' },
    { v: 'There isn’t one', tone: 'yes' },
  ],
};

/** Web3Forms' pricing page refused automated reads on 28 Oct 2026, so these cells are as last confirmed. */
const web3formsUnverified = 'As of 15 Sep 2026; their pricing page couldn’t be re-checked on 28 Oct';

export const competitors: Competitor[] = [
  {
    name: 'Formspree',
    slug: 'formspree',
    checkedOn: '2026-10-28',
    checkedOnLabel: '28 Oct 2026',
    sources: [
      { label: 'plans', url: 'https://formspree.io/plans' },
      { label: 'file uploads', url: 'https://help.formspree.io/articles/building-your-form/file-uploads' },
      { label: 'redirects', url: 'https://help.formspree.io/hc/en-us/articles/360012378333--Thank-You-redirect' },
      {
        label: 'email URLs phased out',
        url: 'https://help.formspree.io/hc/en-us/articles/360056076314-Phasing-out-legacy-forms-email-URLs',
      },
    ],
    cells: [
      { v: '50' },
      { v: 'Unlimited', tone: 'yes' },
      { v: 'No, account needed', tone: 'no' },
      { v: '30-day archive', tone: 'part', note: 'Export on paid plans' },
      { v: 'Discord, Slack, Telegram', tone: 'part', note: 'Webhooks and Zapier from Professional' },
      { v: 'Paid plans', tone: 'no' },
      { v: 'Paid plans', tone: 'no' },
      { v: '—', note: 'No source or self-hosting listed' },
      { v: '$15/mo', note: '$10/mo billed yearly' },
    ],
  },
  {
    name: 'Web3Forms',
    slug: 'web3forms',
    checkedOn: '2026-10-28',
    checkedOnLabel: '28 Oct 2026',
    sources: [
      { label: 'pricing', url: 'https://web3forms.com/pricing' },
      { label: 'install docs', url: 'https://docs.web3forms.com/getting-started/installation' },
      { label: 'redirects', url: 'https://docs.web3forms.com/getting-started/customizations/redirection' },
      { label: 'Slack (PRO)', url: 'https://docs.web3forms.com/getting-started/integrations/slack' },
      { label: 'file uploads (PRO)', url: 'https://docs.web3forms.com/getting-started/pro-features/file-attachments' },
    ],
    cells: [
      { v: '250', note: web3formsUnverified },
      { v: 'Unlimited', tone: 'yes', note: web3formsUnverified },
      { v: 'Verify your email for a key', tone: 'part' },
      { v: '30-day history, CSV', tone: 'part', note: web3formsUnverified },
      { v: 'Paid plans', tone: 'no', note: 'Webhooks, Slack, Discord and Telegram are PRO' },
      { v: 'Paid plans', tone: 'no' },
      { v: 'Same domain only', tone: 'part', note: 'Other domains on paid plans' },
      { v: '—', note: 'No source or self-hosting listed' },
      { v: '$16/mo, billed yearly', note: web3formsUnverified },
    ],
  },
  {
    name: 'FormSubmit',
    slug: 'formsubmit',
    checkedOn: '2026-10-28',
    checkedOnLabel: '28 Oct 2026',
    sources: [
      { label: 'home', url: 'https://formsubmit.co/' },
      { label: 'docs', url: 'https://formsubmit.co/documentation' },
    ],
    cells: [
      { v: 'No cap stated', tone: 'yes' },
      { v: 'No cap stated', tone: 'yes' },
      { v: 'Yes, email in the URL', tone: 'yes' },
      { v: '30 days, API only', tone: 'part', note: 'No dashboard; API 5 calls a day' },
      { v: 'Webhooks', tone: 'part', note: 'No chat apps listed' },
      { v: 'Yes', tone: 'yes', note: '10 MB a submission' },
      { v: 'Yes', tone: 'yes' },
      { v: '—', note: 'No source or self-hosting listed' },
      { v: 'None listed' },
    ],
  },
  {
    name: 'Getform (Forminit)',
    slug: 'getform',
    note: 'Renamed Forminit, Jan 2026',
    checkedOn: '2026-10-28',
    checkedOnLabel: '28 Oct 2026',
    sources: [
      { label: 'pricing', url: 'https://forminit.com/pricing/' },
      { label: 'rename', url: 'https://forminit.com/blog/getform-is-now-forminit/' },
      { label: 'docs', url: 'https://forminit.com/docs/why-forminit/' },
    ],
    cells: [
      { v: '100', note: 'Forms pause when it’s used up' },
      { v: '1', tone: 'no' },
      { v: 'No, account needed', tone: 'no' },
      { v: 'Unlimited archive', tone: 'part', note: 'CSV export on Pro' },
      { v: 'Pro plan', tone: 'no', note: 'Webhooks, Slack and Discord on Pro' },
      { v: 'Yes', tone: 'yes', note: '100 MB storage, 25 MB a submission' },
      { v: 'Yes', tone: 'yes' },
      { v: '—', note: 'No source or self-hosting listed' },
      { v: '$190/year', note: 'Pro, shown as $16/mo' },
    ],
  },
];

/** Things the others genuinely do well. Saying so is the point. */
export const fairPoints = [
  { who: 'FormSubmit', what: 'needs no account at all and states no submission cap: email in the URL, confirm once, done.' },
  { who: 'Formspree', what: 'runs a machine-learning spam filter on every plan, supports reCAPTCHA, hCaptcha and Turnstile, and free forms can post to Discord, Slack and Telegram.' },
  { who: 'Web3Forms', what: 'adds hCaptcha to free forms with no setup at all.' },
  { who: 'Getform (Forminit)', what: 'keeps an unlimited submission archive and accepts file uploads on its free plan.' },
];
