import type { Account, Channel, Delivery, Form, Submission, SubmissionStatus } from './types';

export * from './types';

/** Mock "now". Everything is relative to this, so pages render identically every build. */
export const NOW = new Date('2026-09-14T15:42:00Z').getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (t: number) => new Date(t).toISOString();

/* Seeded PRNG so generated data is stable */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const pick = <T,>(r: () => number, arr: readonly T[]) => arr[Math.floor(r() * arr.length)];

const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulid(t: number, r: () => number) {
  let time = '';
  let n = t;
  for (let i = 0; i < 10; i++) {
    time = CROCK[n % 32] + time;
    n = Math.floor(n / 32);
  }
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCK[Math.floor(r() * 32)];
  return time + rand;
}

/** "SM8 7Q2K 9F4X 3M" — shown everywhere a submission is referenced. */
export function trackingNo(id: string) {
  const tail = id.slice(-10);
  return `SM8 ${tail.slice(0, 4)} ${tail.slice(4, 8)} ${tail.slice(8)}`;
}

/* ------------------------------------------------------------------------ */
/* Account                                                                  */
/* ------------------------------------------------------------------------ */

export const account: Account = {
  name: 'Robin Achterberg',
  email: 'robin@achterberg.studio',
  initials: 'RA',
  provider: 'github',
  handle: 'robinach',
  joinedAt: iso(NOW - 96 * DAY),
  resend: {
    connected: false,
    maskedKey: null,
    fromAddress: null,
    verifiedAt: null,
    domains: ['achterberg.studio', 'mail.achterberg.studio'],
  },
  usage: {
    instantEmailsToday: 64,
    submissionsThisMonth: 612,
    digestQueued: 0,
  },
  verifiedEmails: [
    { email: 'robin@achterberg.studio', verifiedAt: iso(NOW - 96 * DAY) },
    { email: 'hello@achterberg.studio', verifiedAt: iso(NOW - 40 * DAY) },
    { email: 'rsvp@tomandpriya.wedding', verifiedAt: null },
  ],
};

/* ------------------------------------------------------------------------ */
/* Forms                                                                    */
/* ------------------------------------------------------------------------ */

function series(seed: number, base: number, spread: number, trend = 0, zeros = 0) {
  const r = rng(seed);
  return Array.from({ length: 30 }, (_, i) => {
    if (r() < zeros) return 0;
    const v = base + trend * i + (r() - 0.5) * spread * 2;
    return Math.max(0, Math.round(v));
  });
}

export const forms: Form[] = [
  {
    id: 'k3x9q2m7ab',
    name: 'Studio contact',
    status: 'active',
    createdAt: iso(NOW - 95 * DAY),
    allowedOrigins: ['achterberg.studio', 'www.achterberg.studio'],
    redirectUrl: 'https://achterberg.studio/thanks',
    notify: 'instant',
    honeypotField: '_gotcha',
    turnstile: 'challenge',
    aiSpamScoring: true,
    daily: series(11, 5, 3, 0.12),
    monthCount: 184,
    totalCount: 1_106,
    spamCount: 41,
    lastReceivedAt: iso(NOW - 7 * MIN),
    fieldNames: ['name', 'email', 'budget', 'message'],
  },
  {
    id: 'w4itl1st9z',
    name: 'Tidepool beta waitlist',
    status: 'active',
    createdAt: iso(NOW - 38 * DAY),
    allowedOrigins: ['tidepool.app'],
    redirectUrl: null,
    notify: 'digest',
    honeypotField: '_gotcha',
    turnstile: 'byo',
    aiSpamScoring: false,
    daily: series(29, 9, 6, 0.55),
    monthCount: 361,
    totalCount: 588,
    spamCount: 17,
    lastReceivedAt: iso(NOW - 26 * MIN),
    fieldNames: ['email', 'role', 'team_size'],
  },
  {
    id: 'r5vp2026tp',
    name: 'Tom & Priya RSVP',
    status: 'active',
    createdAt: iso(NOW - 21 * DAY),
    allowedOrigins: ['tomandpriya.wedding'],
    redirectUrl: 'https://tomandpriya.wedding/see-you-there',
    notify: 'instant',
    honeypotField: 'website',
    turnstile: 'off',
    aiSpamScoring: false,
    daily: series(7, 2, 2, -0.02, 0.3),
    monthCount: 58,
    totalCount: 67,
    spamCount: 0,
    lastReceivedAt: iso(NOW - 19 * HOUR),
    fieldNames: ['name', 'attending', 'guests', 'dietary', 'song_request'],
  },
  {
    id: 'bugr3p0rt5',
    name: 'Blocky Bay bug reports',
    status: 'paused',
    createdAt: iso(NOW - 70 * DAY),
    allowedOrigins: [],
    redirectUrl: null,
    notify: 'instant',
    honeypotField: '_gotcha',
    turnstile: 'challenge',
    aiSpamScoring: true,
    daily: [4, 6, 3, 5, 7, 2, 4, 6, 5, 3, 4, 2, 1, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    monthCount: 9,
    totalCount: 243,
    spamCount: 12,
    lastReceivedAt: iso(NOW - 15 * DAY),
    fieldNames: ['summary', 'steps', 'device', 'screenshot'],
  },
  {
    id: 'hello@achterberg.studio',
    name: 'hello@achterberg.studio',
    status: 'pending_confirmation',
    createdAt: iso(NOW - 2 * HOUR),
    allowedOrigins: [],
    redirectUrl: null,
    notify: 'instant',
    honeypotField: '_gotcha',
    turnstile: 'challenge',
    aiSpamScoring: false,
    daily: [...Array(29).fill(0), 1],
    monthCount: 1,
    totalCount: 1,
    spamCount: 0,
    lastReceivedAt: iso(NOW - 2 * HOUR),
    fieldNames: ['email', 'message'],
  },
];

export const getForm = (id: string) => forms.find((f) => f.id === id);

/* ------------------------------------------------------------------------ */
/* Channels                                                                 */
/* ------------------------------------------------------------------------ */

export const channels: Channel[] = [
  { id: 'ch_e1', formId: 'k3x9q2m7ab', type: 'email', label: 'Email', target: 'robin@achterberg.studio', enabled: true, lastTest: { at: iso(NOW - 95 * DAY), ok: true, message: 'Delivered in 1.2s' } },
  { id: 'ch_d1', formId: 'k3x9q2m7ab', type: 'discord', label: '#studio-leads', target: 'discord.com/api/webhooks/1182…/•••• 9aQ', enabled: true, lastTest: { at: iso(NOW - 12 * DAY), ok: true, message: '204 No Content in 310ms' } },
  { id: 'ch_w1', formId: 'k3x9q2m7ab', type: 'webhook', label: 'Notion sync', target: 'https://hooks.achterberg.studio/sendm8', enabled: false, lastTest: { at: iso(NOW - 3 * DAY), ok: false, message: 'Timed out after 5s' } },
  { id: 'ch_e2', formId: 'w4itl1st9z', type: 'email', label: 'Daily digest', target: 'robin@achterberg.studio', enabled: true },
  { id: 'ch_s2', formId: 'w4itl1st9z', type: 'slack', label: '#waitlist', target: 'hooks.slack.com/services/T04…/•••• kE2', enabled: true, lastTest: { at: iso(NOW - 38 * DAY), ok: true, message: '200 ok in 420ms' } },
  { id: 'ch_h2', formId: 'w4itl1st9z', type: 'webhook', label: 'Tidepool API', target: 'https://api.tidepool.app/hooks/waitlist', enabled: true, lastTest: { at: iso(NOW - 6 * DAY), ok: true, message: '202 Accepted in 180ms' } },
  { id: 'ch_e3', formId: 'r5vp2026tp', type: 'email', label: 'Email', target: 'rsvp@tomandpriya.wedding', enabled: true },
  { id: 'ch_t3', formId: 'r5vp2026tp', type: 'telegram', label: 'Priya’s phone', target: 'Bot @tp_rsvp_bot → chat 48•••••12', enabled: true, lastTest: { at: iso(NOW - 20 * DAY), ok: true, message: 'Message sent' } },
  { id: 'ch_e4', formId: 'bugr3p0rt5', type: 'email', label: 'Email', target: 'robin@achterberg.studio', enabled: true },
  { id: 'ch_d4', formId: 'bugr3p0rt5', type: 'discord', label: '#bugs', target: 'discord.com/api/webhooks/9921…/•••• x7P', enabled: true },
  { id: 'ch_e5', formId: 'hello@achterberg.studio', type: 'email', label: 'Email', target: 'hello@achterberg.studio', enabled: true },
];

export const channelsFor = (formId: string) => channels.filter((c) => c.formId === formId);

/* ------------------------------------------------------------------------ */
/* Submissions                                                              */
/* ------------------------------------------------------------------------ */

type Seed = {
  ago: number;
  data: Record<string, string>;
  status?: SubmissionStatus;
  score?: number;
  reasons?: string[];
  starred?: boolean;
  read?: boolean;
  country?: [string, string];
  ref?: string;
  files?: Submission['files'];
  fail?: { type: Delivery['type']; error: string; retry?: boolean };
  digest?: boolean;
};

const UAS = [
  'Safari 19 · macOS',
  'Chrome 139 · Windows 11',
  'Firefox 142 · Ubuntu',
  'Safari · iPhone (iOS 26)',
  'Chrome 139 · Android 16',
  'Edge 139 · Windows 11',
  'Arc · macOS',
];

const studio: Seed[] = [
  { ago: 7 * MIN, data: { name: 'Marta Oyelaran', email: 'marta@fieldnotes.coffee', budget: '£8–15k', message: 'Hi Robin, we’re a small coffee roaster in Leeds opening a second site in March. We need a site that isn’t a Shopify template, with a menu we can update ourselves. Are you taking projects for early next year?' }, country: ['GB', 'United Kingdom'], ref: 'achterberg.studio/contact', read: false, starred: true },
  { ago: 52 * MIN, data: { name: 'Jonas Lindqvist', email: 'jonas@lindqvist.se', budget: 'Not sure yet', message: 'Saw the Tidepool case study. Could you do something similar for a sailing school? Happy to jump on a call this week.' }, country: ['SE', 'Sweden'], ref: 'achterberg.studio/work/tidepool', read: false },
  { ago: 2 * HOUR + 11 * MIN, data: { name: 'SEO Growth Team', email: 'rank@top1-seo-agency.biz', budget: '', message: 'Dear website owner, we can get you on page 1 of Google GUARANTEED!!! Visit https://top1-seo-agency.biz https://bit.ly/rank-now https://bit.ly/rank2 for FREE audit' }, status: 'spam', score: 0.97, reasons: ['3 links in a 140-character message', 'Phrase match: “guaranteed”, “page 1 of Google”', 'Sender domain on disposable list'], country: ['VN', 'Vietnam'], ref: '(direct)' },
  { ago: 3 * HOUR + 40 * MIN, data: { name: 'Ade Balogun', email: 'ade@northwall.climbing', budget: '£15k+', message: 'We’re rebuilding the Northwall booking flow. Our current provider charges per booking and it’s eating us alive. Do you work with Astro? Attaching our current sitemap.' }, files: [{ field: 'attachment', name: 'northwall-sitemap.pdf', sizeKb: 412, type: 'application/pdf' }], country: ['GB', 'United Kingdom'], ref: 'google.com', starred: true },
  { ago: 5 * HOUR + 5 * MIN, data: { name: 'Claire Dubois', email: 'claire.dubois@maison-ardoise.fr', budget: '£3–8k', message: 'Bonjour! Small architecture practice in Nantes, we need a portfolio site in French and English. Would you consider a smaller project?' }, country: ['FR', 'France'], ref: 'achterberg.studio', fail: { type: 'discord', error: 'Discord returned 429 Too Many Requests', retry: true } },
  { ago: 9 * HOUR, data: { name: 'Pete', email: 'pete.w@gmail.com', budget: '', message: 'Quick one: what font is on your homepage? Loving it.' }, country: ['AU', 'Australia'], ref: 'twitter.com', read: true },
  { ago: 22 * HOUR, data: { name: 'Anika Rao', email: 'anika@ledgerlight.io', budget: '£15k+', message: 'Series A fintech, need a marketing site rebuild before our launch in November. We have a design system in Figma already. Timeline is tight, is that a dealbreaker?' }, country: ['IN', 'India'], ref: 'linkedin.com', read: true, starred: true },
  { ago: 26 * HOUR, data: { name: 'crypto_king', email: 'x@mailinator.com', budget: '', message: 'Earn 5 BTC per week from home. Click here to claim your FREE crypto wallet now' }, status: 'spam', score: 0.99, reasons: ['Honeypot field “_gotcha” was filled', 'Phrase match: “free crypto”', 'Disposable email domain'], country: ['NL', 'Netherlands'], ref: '(direct)' },
  { ago: 31 * HOUR, data: { name: 'Hamish Grant', email: 'hamish@grantandsons.co.uk', budget: '£3–8k', message: 'Family joinery business, 3rd generation. Our site was built in 2011 and it shows. Could we have a chat about a simple refresh?' }, country: ['GB', 'United Kingdom'], ref: 'achterberg.studio/services', read: true },
  { ago: 2 * DAY + 3 * HOUR, data: { name: 'Leah Kim', email: 'leah@softserve.studio', budget: 'Not sure yet', message: 'Fellow freelancer here. Would you be open to sharing overflow work? I do brand and illustration, you seem to do the build side really well.' }, country: ['CA', 'Canada'], ref: 'are.na', read: true },
  { ago: 2 * DAY + 20 * HOUR, data: { name: 'Account Security', email: 'security@paypa1-verify.com', budget: '', message: 'Your account will be suspended. Verify your password at the link below within 24 hours.' }, status: 'spam', score: 0.93, reasons: ['Looks like a phishing lure: “verify your password”', 'Lookalike domain: paypa1-verify.com'], country: ['US', 'United States'], ref: '(direct)' },
  { ago: 3 * DAY + 2 * HOUR, data: { name: 'Tomás Herrera', email: 'tomas@herrera.film', budget: '£8–15k', message: 'Documentary production company. Need a site that can handle video without being slow as treacle. Have seen your work for Tidepool.' }, country: ['ES', 'Spain'], ref: 'achterberg.studio/work', read: true, fail: { type: 'webhook', error: 'Timed out after 5s (hooks.achterberg.studio)' } },
  { ago: 4 * DAY, data: { name: 'Grace Mensah', email: 'grace@kitchen-table.org', budget: '£3–8k', message: 'We’re a community food charity. Do you do discounted rates for non-profits? Totally fine if not.' }, country: ['GH', 'Ghana'], ref: 'achterberg.studio', read: true, starred: true },
  { ago: 4 * DAY + 6 * HOUR, data: { name: 'Olu', email: 'olu@hey.com', budget: '', message: 'Is the contact form on your site built with sendm8? Asking for a friend (the friend is me).' }, country: ['GB', 'United Kingdom'], ref: 'achterberg.studio', read: true, score: 0.08 },
  { ago: 5 * DAY + 1 * HOUR, data: { name: 'Bianca Rossi', email: 'bianca@trattoriarossi.it', budget: '£3–8k', message: 'Restaurant in Bologna. We want online table bookings and a menu that changes daily. Speak English a little, sorry!' }, country: ['IT', 'Italy'], ref: 'instagram.com', read: true, digest: true },
  { ago: 6 * DAY, data: { name: 'Sam Whitlock', email: 'sam@whitlock.dev', budget: 'Not sure yet', message: 'Recruiter-free zone I promise. Would you ever consider a 3-month contract with a product team?' }, country: ['GB', 'United Kingdom'], ref: 'github.com', read: true, score: 0.21 },
  { ago: 6 * DAY + 9 * HOUR, data: { name: 'Wendy', email: 'wendy.linkbuilder@outlook.com', budget: '', message: 'Hello, I would like to write a guest post for your blog with a do-follow link. What is your price?' }, status: 'spam', score: 0.81, reasons: ['Phrase match: “guest post”, “do-follow”', 'AI score: likely link-building outreach'], country: ['PK', 'Pakistan'], ref: '(direct)' },
  { ago: 8 * DAY, data: { name: 'Nils Becker', email: 'nils@becker-velo.de', budget: '£8–15k', message: 'Bicycle shop in Freiburg, we want to sell refurbished bikes online. Is e-commerce something you do?' }, country: ['DE', 'Germany'], ref: 'google.de', read: true },
  { ago: 9 * DAY + 4 * HOUR, data: { name: 'Mei Chen', email: 'mei@paperlantern.co', budget: '£15k+', message: 'Publisher of children’s books. We need a site that feels like opening one of our books. Big ask, I know.' }, country: ['SG', 'Singapore'], ref: 'achterberg.studio/work', read: true, starred: true },
  { ago: 11 * DAY, data: { name: 'Dev Patel', email: 'dev@quietmode.app', budget: '£3–8k', message: 'Indie app, landing page only. Need it before our Product Hunt launch on the 30th.' }, country: ['GB', 'United Kingdom'], ref: 'news.ycombinator.com', read: true },
];

const waitlistRoles = ['Marine biologist', 'Product designer', 'Teacher', 'Founder', 'Engineer', 'Researcher', 'Student', 'Aquarium keeper', 'Photographer', 'Data scientist'];
const waitlistDomains = ['gmail.com', 'proton.me', 'outlook.com', 'uni-kiel.de', 'noaa.gov', 'hey.com', 'icloud.com', 'reefcheck.org'];
const firstNames = ['ayla', 'ben', 'chiara', 'dmitri', 'eun-ji', 'fatima', 'gus', 'hana', 'ivo', 'jade', 'kofi', 'lena', 'mateo', 'noor', 'oscar', 'pia', 'quinn', 'rhys', 'saoirse', 'theo'];
const countries: [string, string][] = [['GB', 'United Kingdom'], ['US', 'United States'], ['DE', 'Germany'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['JP', 'Japan'], ['PT', 'Portugal'], ['CA', 'Canada']];

function waitlistSeeds(): Seed[] {
  const r = rng(404);
  const seeds: Seed[] = [];
  let t = 26 * MIN;
  for (let i = 0; i < 18; i++) {
    const n = pick(r, firstNames);
    const spam = r() < 0.1;
    seeds.push({
      ago: t,
      data: spam
        ? { email: `promo${Math.floor(r() * 900)}@tempmail.dev`, role: 'CHEAP FOLLOWERS', team_size: '1000' }
        : { email: `${n}${r() < 0.4 ? '.' + pick(r, ['m', 'k', 'r', 's']) : ''}@${pick(r, waitlistDomains)}`, role: pick(r, waitlistRoles), team_size: pick(r, ['Just me', '2–10', '11–50', '50+']) },
      status: spam ? 'spam' : 'ok',
      score: spam ? 0.88 : Math.round(r() * 12) / 100,
      reasons: spam ? ['Turnstile token missing', 'Disposable email domain'] : [],
      country: pick(r, countries),
      ref: pick(r, ['tidepool.app', 'tidepool.app/?ref=producthunt', 'twitter.com', 'tidepool.app/blog/why']),
      read: i > 3,
      digest: true,
    });
    t += Math.floor(40 * MIN + r() * 5 * HOUR);
  }
  return seeds;
}

const rsvp: Seed[] = [
  { ago: 19 * HOUR, data: { name: 'Auntie Meera & Uncle Raj', attending: 'Yes, obviously', guests: '2', dietary: 'Vegetarian (both)', song_request: 'Tunak Tunak Tun' }, country: ['GB', 'United Kingdom'], ref: 'tomandpriya.wedding', starred: true },
  { ago: 1 * DAY + 5 * HOUR, data: { name: 'Callum Fraser', attending: 'Yes', guests: '1', dietary: '', song_request: 'Mr Brightside, and I will not be taking questions' }, country: ['GB', 'United Kingdom'], ref: 'tomandpriya.wedding', read: true },
  { ago: 2 * DAY, data: { name: 'The Nakamuras', attending: 'Sadly no', guests: '0', dietary: '', song_request: 'Play something for us! Congratulations x' }, country: ['JP', 'Japan'], ref: 'tomandpriya.wedding', read: true },
  { ago: 3 * DAY + 7 * HOUR, data: { name: 'Priya’s netball team', attending: 'Yes', guests: '7', dietary: '1 gluten free, 1 vegan, 5 “anything”', song_request: 'Dancing Queen' }, country: ['GB', 'United Kingdom'], ref: 'tomandpriya.wedding', read: true, fail: { type: 'telegram', error: 'Telegram: bot was blocked by the user' } },
  { ago: 5 * DAY, data: { name: 'Grandad Len', attending: 'Yes', guests: '1', dietary: 'No spicy food please', song_request: 'Anything by Glenn Miller' }, country: ['GB', 'United Kingdom'], ref: 'tomandpriya.wedding', read: true, starred: true },
];

const bugs: Seed[] = [
  { ago: 15 * DAY, data: { summary: 'Crabs clip through the pier on level 4', steps: '1. Start level 4\n2. Walk to the end of the pier\n3. Wait for the tide\nCrabs fall through the planks and respawn on top of you', device: 'iPad Air (M2), iPadOS 26' }, files: [{ field: 'screenshot', name: 'IMG_4471.PNG', sizeKb: 2310, type: 'image/png' }], country: ['US', 'United States'], ref: 'blockybay.game/report', read: true },
  { ago: 16 * DAY, data: { summary: 'Save file gone after update', steps: 'Updated to 1.4.2, opened the game, all my islands are gone :(', device: 'Pixel 9, Android 16' }, country: ['BR', 'Brazil'], ref: 'blockybay.game/report', read: true, starred: true },
  { ago: 17 * DAY, data: { summary: 'Enter your card_number to unlock', steps: 'card_number cvv password', device: 'bot' }, status: 'held', score: 0.74, reasons: ['Held: field names look like a payment or password form (card_number, cvv, password)', 'Not delivered until you review it'], country: ['RU', 'Russia'], ref: '(direct)' },
];

const pending: Seed[] = [
  { ago: 2 * HOUR, data: { email: 'first.test@achterberg.studio', message: 'Testing testing, is this thing on?' }, country: ['GB', 'United Kingdom'], ref: 'localhost:4321' },
];

function build(formId: string, seeds: Seed[], seed: number): Submission[] {
  const r = rng(seed);
  const chans = channelsFor(formId).filter((c) => c.enabled);
  const form = getForm(formId)!;
  return seeds.map((s) => {
    const t = NOW - s.ago;
    const id = ulid(t, r);
    const status: SubmissionStatus = s.status ?? 'ok';
    const score = s.score ?? Math.round(r() * 9) / 100;
    const deliveries: Delivery[] =
      form.status === 'pending_confirmation'
        ? chans.map((c) => ({ channelId: c.id, type: c.type, target: c.target, status: 'skipped', attempts: 0, at: iso(t), error: 'Waiting for the address to be confirmed' }))
        : status !== 'ok'
          ? []
          : chans.map((c) => {
              const lat = 400 + Math.floor(r() * 2400);
              const isFail = s.fail?.type === c.type;
              const isDigest = (s.digest || form.notify === 'digest') && c.type === 'email';
              if (isFail) {
                return {
                  channelId: c.id,
                  type: c.type,
                  target: c.target,
                  status: s.fail!.retry ? 'retrying' : 'failed',
                  attempts: s.fail!.retry ? 2 : 5,
                  at: iso(t + lat),
                  error: s.fail!.error,
                  nextRetryAt: s.fail!.retry ? iso(NOW + 24 * MIN) : undefined,
                } satisfies Delivery;
              }
              return {
                channelId: c.id,
                type: c.type,
                target: c.target,
                status: isDigest ? 'digest' : 'delivered',
                attempts: 1,
                at: iso(t + lat),
              } satisfies Delivery;
            });
    return {
      id,
      formId,
      tracking: trackingNo(id),
      createdAt: iso(t),
      data: s.data,
      files: s.files ?? [],
      meta: {
        country: s.country?.[0] ?? 'GB',
        countryName: s.country?.[1] ?? 'United Kingdom',
        userAgent: pick(r, UAS),
        referrer: s.ref ?? '(direct)',
        ipHash: Array.from({ length: 8 }, () => Math.floor(r() * 16).toString(16)).join(''),
      },
      spamScore: status === 'ok' ? score : (s.score ?? 0.9),
      spamReasons: s.reasons ?? (score > 0.15 ? ['Slightly unusual wording, nothing conclusive'] : []),
      status,
      starred: s.starred ?? false,
      read: s.read ?? status !== 'ok',
      deliveries,
    };
  });
}

export const submissions: Submission[] = [
  ...build('k3x9q2m7ab', studio, 1),
  ...build('w4itl1st9z', waitlistSeeds(), 2),
  ...build('r5vp2026tp', rsvp, 3),
  ...build('bugr3p0rt5', bugs, 4),
  ...build('hello@achterberg.studio', pending, 5),
];

export const submissionsFor = (formId: string) =>
  submissions.filter((s) => s.formId === formId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const unreadCount = (formId: string) => submissionsFor(formId).filter((s) => !s.read && s.status === 'ok').length;

/* ------------------------------------------------------------------------ */
/* Formatting helpers shared by the app                                     */
/* ------------------------------------------------------------------------ */

/** Fixed short month names: en-GB ICU now prints “Sept”, which reads oddly on a postmark. */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function timeAgo(isoStr: string, now = NOW) {
  const d = now - new Date(isoStr).getTime();
  if (d < MIN) return 'just now';
  if (d < HOUR) return `${Math.round(d / MIN)} min ago`;
  if (d < DAY) return `${Math.round(d / HOUR)} h ago`;
  if (d < 2 * DAY) return 'yesterday';
  if (d < 30 * DAY) return `${Math.round(d / DAY)} days ago`;
  const date = new Date(isoStr);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function stamp(isoStr: string) {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()].toUpperCase()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export function endpointFor(formId: string) {
  return `https://sendm8.com/f/${formId}`;
}
