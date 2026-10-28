/**
 * Narrative copy for the /vs/<slug> pages — one per competitor in config/compare.ts.
 * The facts here must match the cells and sources in compare.ts; this file is the prose around them.
 * Never state a competitor's number here that compare.ts can't back with a source.
 */
import { LIMITS } from '@sendm8/shared';
import { fmt, limits, site } from './site';

export interface VsFaq {
  q: string;
  /** Plain text: it's also the FAQPage JSON-LD answer. */
  a: string;
}

export interface VsCode {
  code: string;
  lang: string;
  filename: string;
  highlight?: number[];
}

export interface VsContent {
  slug: string;
  /** Meta description, 120–160 characters. */
  description: string;
  /** Shown in the hero, under the h1. */
  intro: string;
  /** Three short, specific differences — not generic marketing lines. */
  highlights: string[];
  /** When the competitor is the better pick. Honest, or the page is worthless. */
  pickThemIf: string[];
  switching: {
    intro: string;
    before: VsCode;
    after: VsCode;
    /** Field-by-field notes; trusted HTML (<code> only). */
    notes: string[];
    cta: { label: string; href: string };
  };
  faq: VsFaq[];
}

const perForm = fmt.n(limits.submissionsPerFormPerMonth);
const unclaimed = fmt.n(LIMITS.submissionsPerUnclaimedFormPerMonth);
const forms = fmt.n(limits.forms);
const ENDPOINT = `${site.endpointBase}you@example.com`;

const formBody = `  <input name="email" type="email" required>
  <textarea name="message" required></textarea>`;

export const vsContent: VsContent[] = [
  {
    slug: 'formspree',
    description: 'Formspree’s free plan keeps 50 submissions and needs an account. sendm8 is a free, open-source Formspree alternative: no signup, uploads and redirects included.',
    intro: `Formspree needs an account before a form works, and its free plan keeps 50 submissions a month. sendm8 works the moment you paste a URL with your email in it, and keeps ${perForm} submissions a month per form once you sign in. It’s free, open source and self-hostable.`,
    highlights: [
      `${perForm} free submissions a month per form, against Formspree’s 50.`,
      'No account needed to start: your email address in the URL is the whole setup.',
      `Custom redirects and file uploads (${limits.fileUploadMb} MB a file) on the free plan, where Formspree keeps both for paid plans.`,
    ],
    pickThemIf: [
      'You want a long-established, commercially supported service with paid plans, a support team and integrations such as Zapier.',
      'You rely on Formspree’s machine-learning spam filter or its reCAPTCHA and hCaptcha options. sendm8 has its own spam scoring, an AI check and Cloudflare Turnstile, but not those two.',
      'You need more than a few files per submission, or larger ones: Formspree’s paid plans allow far bigger uploads than sendm8.',
    ],
    switching: {
      intro: 'For most forms, it’s one line: change the action URL. Use your email address for a form without an account, or a form id from the dashboard.',
      before: { code: `<form action="https://formspree.io/f/xyzabcde" method="POST">\n${formBody}\n  <button>Send</button>\n</form>`, lang: 'html', filename: 'Before: Formspree', highlight: [1] },
      after: { code: `<form action="${ENDPOINT}" method="POST">\n${formBody}\n  <button>Send</button>\n</form>`, lang: 'html', filename: 'After: sendm8', highlight: [1] },
      notes: [
        'An <code>email</code> field becomes the Reply-To on sendm8 too. <code>_replyto</code> works as well.',
        'The <code>_gotcha</code> honeypot works the same way.',
        'Formspree documents <code>subject</code> for the email subject; sendm8 uses <code>_subject</code>. Rename it, or it arrives as an ordinary field.',
        'Formspree’s thank-you redirect is a dashboard setting. On sendm8, add a hidden <code>_next</code> field, or set a redirect URL in Form settings.',
        'Using <code>@formspree/react</code>? <code>@sendm8/react</code> has the same <code>useForm</code> and <code>ValidationError</code>; change the import and the form id.',
      ],
      cta: { label: 'Read the full Formspree migration guide', href: '/docs/formspree/' },
    },
    faq: [
      { q: 'Is sendm8 free forever, or is there a paid plan I’ll eventually need?', a: `There’s no paid plan. Every account gets ${perForm} submissions a month per form on up to ${forms} forms. If you outgrow that, the code is open source and you can run your own copy.` },
      { q: 'Will switching from Formspree break my existing form fields?', a: 'Usually not. Your own field names are kept as they are, and email and _gotcha work the same way. Rename a subject field to _subject, and add _next if you used a thank-you redirect.' },
      { q: 'Can I keep using React?', a: 'Yes. @sendm8/react has useForm and ValidationError with the same API as @formspree/react, so most components only need the import and form id changed.' },
    ],
  },
  {
    slug: 'web3forms',
    description: 'Compare sendm8 with Web3Forms: free Discord, Slack, Telegram, webhooks and file uploads, no access key, and open source. Plus how to switch in a few lines.',
    intro: `Web3Forms emails you an access key before a form works, and keeps Slack, Discord, Telegram, webhooks and file uploads for paid plans. sendm8 starts with nothing but your email address in the URL, and includes chat apps, webhooks and uploads free, with ${perForm} submissions a month per form once you sign in.`,
    highlights: [
      'Discord, Slack, Telegram and webhook delivery free and unlimited. Web3Forms lists each as a PRO feature.',
      `File uploads on the free plan, up to ${limits.fileUploadMb} MB a file. Web3Forms keeps uploads for paid plans.`,
      'Redirect to any domain you’ve allowed, free. Web3Forms’ free plan only redirects within the same domain.',
    ],
    pickThemIf: [
      'You want hCaptcha on your form with no setup. Web3Forms adds it to free forms automatically; sendm8 offers Cloudflare Turnstile instead.',
      'You already have Web3Forms access keys spread across many sites and everything you need works on their free plan.',
      'You’d rather use a service that doesn’t keep your submissions in a dashboard at all. sendm8 stores every submission so you can search and export it.',
    ],
    switching: {
      intro: 'Change the action URL and remove the access key. Then rename a few of Web3Forms’ fields to sendm8’s, because unrecognised fields arrive as ordinary form data.',
      before: {
        code: `<form action="https://api.web3forms.com/submit" method="POST">\n  <input type="hidden" name="access_key" value="YOUR-ACCESS-KEY">\n  <input type="hidden" name="subject" value="New message">\n  <input type="hidden" name="redirect" value="https://yoursite.com/thanks">\n  <input type="checkbox" name="botcheck" style="display:none">\n${formBody}\n  <button>Send</button>\n</form>`,
        lang: 'html',
        filename: 'Before: Web3Forms',
        highlight: [1, 2, 3, 4, 5],
      },
      after: {
        code: `<form action="${ENDPOINT}" method="POST">\n  <input type="hidden" name="_subject" value="New message">\n  <input type="hidden" name="_next" value="https://yoursite.com/thanks">\n  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">\n${formBody}\n  <button>Send</button>\n</form>`,
        lang: 'html',
        filename: 'After: sendm8',
        highlight: [1, 2, 3, 4],
      },
      notes: [
        'Delete <code>access_key</code>: sendm8 doesn’t need one, and left in, it would be stored with every submission.',
        '<code>subject</code> becomes <code>_subject</code>, <code>redirect</code> becomes <code>_next</code>, and <code>replyto</code> becomes <code>_replyto</code> (or just use an <code>email</code> field).',
        'Swap the <code>botcheck</code> checkbox for a hidden <code>_gotcha</code> field, and remove Web3Forms’ hCaptcha script if you used it.',
        'If you post with <code>fetch</code>, send <code>Accept: application/json</code> and check <code>result.ok</code>; sendm8’s errors come with a plain-English <code>error.message</code>.',
      ],
      cta: { label: 'See the basic form and special fields docs', href: '/docs/fields/' },
    },
    faq: [
      { q: 'Do I need an access key, like Web3Forms?', a: 'No. A sendm8 endpoint works with your email address in the URL. You confirm ownership once, by clicking a link in the first email, and every submission after that is delivered.' },
      { q: 'Can I send submissions to Discord or Slack for free?', a: 'Yes. Discord, Slack, Telegram and webhook delivery are free and unlimited on every sendm8 account.' },
      { q: 'How many free submissions do I get?', a: `A no-account endpoint keeps ${unclaimed} submissions a month. Sign in and every form keeps ${perForm} a month, on up to ${forms} forms.` },
    ],
  },
  {
    slug: 'formsubmit',
    description: 'sendm8 vs FormSubmit: both work with your email in the URL. sendm8 adds a dashboard inbox, CSV export, Discord and Slack, and is open source and self-hostable.',
    intro: 'FormSubmit is the closest match to sendm8’s no-signup idea: put your email in the URL, confirm once, done. sendm8 differs in what happens after: a dashboard inbox with search and export, delivery to Discord, Slack and Telegram, and open-source code you can host yourself.',
    highlights: [
      'A dashboard inbox with search, filters, a spam folder and CSV or JSON export. FormSubmit’s history is API-only, 5 calls a day, kept for 30 days.',
      'Discord, Slack and Telegram delivery, as well as webhooks.',
      `Open source and self-hostable under ${site.license}, with the same code that runs sendm8.com.`,
    ],
    pickThemIf: [
      'You don’t want submissions stored anywhere: FormSubmit is closer to a pure relay.',
      `You need more than ${perForm} submissions a month on one form. FormSubmit doesn’t state a cap; sendm8 does.`,
      'You use FormSubmit’s autoresponse or email templates. sendm8 doesn’t send automatic replies to visitors.',
    ],
    switching: {
      intro: 'The endpoint has the same shape, so it’s mostly a change of domain. The common special fields carry over as they are.',
      before: { code: `<form action="https://formsubmit.co/you@example.com" method="POST">\n  <input type="hidden" name="_next" value="https://yoursite.com/thanks">\n  <input type="text" name="_honey" style="display:none">\n${formBody}\n  <button>Send</button>\n</form>`, lang: 'html', filename: 'Before: FormSubmit', highlight: [1, 3] },
      after: { code: `<form action="${ENDPOINT}" method="POST">\n  <input type="hidden" name="_next" value="https://yoursite.com/thanks">\n  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">\n${formBody}\n  <button>Send</button>\n</form>`, lang: 'html', filename: 'After: sendm8', highlight: [1, 3] },
      notes: [
        '<code>_next</code>, <code>_subject</code>, <code>_cc</code> and <code>_replyto</code> work the same way. <code>_cc</code> only copies addresses you’ve verified in your sendm8 account, so it can’t be used to email strangers.',
        'Rename <code>_honey</code> to <code>_gotcha</code>.',
        '<code>_captcha</code>, <code>_template</code>, <code>_autoresponse</code>, <code>_blacklist</code> and <code>_webhook</code> aren’t used by sendm8. Underscore fields are never stored, so leaving them in does no harm. Set webhooks up in the dashboard instead.',
        'FormSubmit’s AJAX URL (<code>/ajax/</code>) isn’t needed: post to the same endpoint with <code>Accept: application/json</code>.',
      ],
      cta: { label: 'See the special fields docs', href: '/docs/fields/' },
    },
    faq: [
      { q: 'Does sendm8 have a submission limit, unlike FormSubmit?', a: `Yes. A no-account endpoint keeps ${unclaimed} submissions a month; a form in your account keeps ${perForm} a month. In return, every submission is stored with search, filters and export.` },
      { q: 'Is there a dashboard, or is it API-only like FormSubmit?', a: 'There’s a full dashboard inbox with search, stars, filters, a spam folder and CSV or JSON export. Sign in with the address you used in the URL and your forms are already there.' },
      { q: 'Does FormSubmit’s _next field work on sendm8?', a: 'Yes. _next sends visitors to your thank-you page. A page on the same site works straight away; another domain must be added to the form’s allowed domains first.' },
    ],
  },
  {
    slug: 'getform',
    description: `Getform is now Forminit: 1 form and 100 submissions free. sendm8 gives up to ${forms} forms with ${perForm} submissions each, plus free webhooks, Slack and Discord.`,
    intro: `Getform is now called Forminit. Its free plan has one form and 100 submissions a month, with webhooks, Slack, Discord and CSV export on Pro. sendm8 gives you up to ${forms} forms with ${perForm} submissions a month each, and includes chat apps, webhooks and export free.`,
    highlights: [
      `Up to ${forms} forms at ${perForm} submissions a month each, against Forminit’s 1 form and 100 submissions.`,
      'Webhooks, Discord, Slack and Telegram free and unlimited. Forminit keeps integrations for Pro.',
      'CSV and JSON export free, and no account needed to start.',
    ],
    pickThemIf: [
      'You want an unlimited submission archive on a free plan without managing retention yourself, and one form is enough.',
      'You need larger uploads per submission: Forminit allows up to 25 MB per submission, more than sendm8’s ' + limits.submissionUploadMb + ' MB.',
      'You want Google Sheets or Zapier integrations out of the box, and are happy to pay for Pro.',
    ],
    switching: {
      intro: 'Old getform.io endpoints still work on Forminit, so you can switch whenever suits you. Change the action URL; plain field names carry over as they are.',
      before: { code: `<form action="https://getform.io/f/abcdwxyz" method="POST">\n  <input type="hidden" name="_gotcha" style="display:none">\n${formBody}\n  <button>Send</button>\n</form>`, lang: 'html', filename: 'Before: Getform', highlight: [1] },
      after: { code: `<form action="${ENDPOINT}" method="POST">\n  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">\n${formBody}\n  <button>Send</button>\n</form>`, lang: 'html', filename: 'After: sendm8', highlight: [1] },
      notes: [
        'The <code>_gotcha</code> honeypot works the same way.',
        'If you’ve moved to Forminit’s <code>fi-</code> field names (like <code>fi-sender-email</code>), rename them to plain names such as <code>email</code> and <code>message</code>; sendm8 stores fields under whatever names you give them.',
        'Redirects are set with a hidden <code>_next</code> field or in Form settings, and file inputs need <code>enctype="multipart/form-data"</code>, as before.',
      ],
      cta: { label: 'See the basic form docs', href: '/docs/basic-form/' },
    },
    faq: [
      { q: 'Is Getform the same as Forminit?', a: 'Yes. Getform was renamed Forminit in January 2026, and existing getform.io endpoints keep working, according to Forminit.' },
      { q: 'Does sendm8 limit the number of forms?', a: `Each account can have up to ${forms} forms, each keeping ${perForm} submissions a month. Email-in-the-URL forms don’t need an account at all.` },
      { q: 'Can I export my submissions for free?', a: 'Yes. Export to CSV or JSON from the dashboard on any sendm8 account.' },
    ],
  },
];

export const vsFor = (slug: string) => vsContent.find((v) => v.slug === slug);
