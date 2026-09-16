import { LIMITS } from '@sendm8/shared';
import { limits, fmt, site } from './site';

/**
 * Free-plan facts, checked by hand against each service's own pricing page and docs.
 * Keep this honest: only write what a linked source says. If you can't confirm a cell,
 * use '—' with a note rather than guessing. Update `sources` and `checkedOn` whenever you re-check.
 */
export const checkedOn = '2026-09-15';
export const checkedOnLabel = '15 Sep 2026';

export type Cell = { v: string; tone?: 'yes' | 'no' | 'part'; note?: string };
export type Source = { label: string; url: string };

export interface Competitor {
  name: string;
  /** URL slug for its /vs/<slug> page. */
  slug: string;
  note?: string;
  cells: Cell[];
  sources?: Source[];
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

export const competitors: Competitor[] = [
  {
    name: 'Formspree',
    slug: 'formspree',
    sources: [
      { label: 'plans', url: 'https://formspree.io/plans' },
      {
        label: 'email URLs phased out',
        url: 'https://help.formspree.io/articles/troubleshooting/phasing-out-legacy-forms-email-urls',
      },
      { label: 'GitHub', url: 'https://github.com/formspree/formspree' },
    ],
    cells: [
      { v: '50' },
      { v: 'Unlimited', tone: 'yes' },
      { v: 'No, account needed', tone: 'no' },
      { v: '30-day archive', tone: 'part', note: 'Export on paid plans' },
      { v: 'Discord, Slack, Telegram', tone: 'part', note: 'Webhooks and Zapier from Professional' },
      { v: 'Paid plans', tone: 'no' },
      { v: 'Paid plans', tone: 'no' },
      { v: 'No', tone: 'no', note: 'Source not available, per their GitHub' },
      { v: '$15/mo', note: '$10/mo billed yearly' },
    ],
  },
  {
    name: 'Web3Forms',
    slug: 'web3forms',
    sources: [
      { label: 'pricing', url: 'https://web3forms.com/pricing' },
      { label: 'install docs', url: 'https://docs.web3forms.com/getting-started/installation' },
    ],
    cells: [
      { v: '250' },
      { v: 'Unlimited', tone: 'yes' },
      { v: 'Verify your email for a key', tone: 'part' },
      { v: '30-day history, CSV', tone: 'part' },
      { v: 'Paid plans', tone: 'no' },
      { v: 'Paid plans', tone: 'no' },
      { v: 'Yes', tone: 'yes' },
      { v: '—', note: 'No source or self-hosting listed' },
      { v: '$16/mo, billed yearly', note: 'Or $71/year Starter, by application' },
    ],
  },
  {
    name: 'FormSubmit',
    slug: 'formsubmit',
    sources: [
      { label: 'home', url: 'https://formsubmit.co/' },
      { label: 'docs', url: 'https://formsubmit.co/documentation' },
      { label: 'help', url: 'https://formsubmit.co/help' },
    ],
    cells: [
      { v: 'Unlimited', tone: 'yes' },
      { v: 'Unlimited', tone: 'yes' },
      { v: 'Yes, email in the URL', tone: 'yes' },
      { v: '30 days, API only', tone: 'part', note: 'No dashboard; API 5 calls a day' },
      { v: 'Webhooks', tone: 'part' },
      { v: 'Yes', tone: 'yes', note: '10 MB a submission' },
      { v: 'Yes', tone: 'yes' },
      { v: '—', note: 'No source or self-hosting listed' },
      { v: 'None listed' },
    ],
  },
];

/** Things the others genuinely do well. Saying so is the point. */
export const fairPoints = [
  { who: 'FormSubmit', what: 'needs no account at all: email in the URL, confirm once, done.' },
  { who: 'Formspree', what: 'runs a machine-learning spam filter on every plan, and free forms can post to Discord, Slack and Telegram.' },
  { who: 'Web3Forms', what: 'gives the most free submissions of the capped services, with CSV export included.' },
];
