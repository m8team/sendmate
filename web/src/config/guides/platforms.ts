import { LIMITS } from '@sendm8/shared';
import { fmt, limits, site } from '../site';
import type { Guide } from './types';

/** The no-account endpoint every snippet uses. Readers swap in their own address. */
const EMAIL = `${site.endpointBase}you@example.com`;
const HELPER = `${site.url}/s/v1.js`;
const unclaimed = fmt.n(LIMITS.submissionsPerUnclaimedFormPerMonth);
const perForm = fmt.n(limits.submissionsPerFormPerMonth);

const htmlForm = (indent = '') =>
  `
<form action="${EMAIL}" method="POST">
  <label>Your email <input name="email" type="email" required></label>
  <label>Message <textarea name="message" required></textarea></label>
  <!-- Honeypot: people never see it, bots fill it in -->
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <button>Send</button>
</form>`
    .split('\n')
    .map((l) => (l ? indent + l : l))
    .join('\n');

/** Paragraphs several platform guides share, so the facts are written once. */
const confirmStep = `The first time anyone submits, sendm8 stores the message and emails <code>you@example.com</code> (well, your address) one confirmation link. Click it and that message, plus anything that arrived meanwhile, is delivered. After that, submissions just arrive.`;
const limitsPara = `A no-account endpoint keeps up to ${unclaimed} submissions a month and delivers by email. Sign in with the same address and the form moves into your account: ${perForm} submissions a month, a dashboard inbox with search and CSV export, and Discord, Slack, Telegram or webhook delivery.`;

const uploadsPara = `To accept files, add <code>enctype="multipart/form-data"</code> to the form and use a normal <code>&lt;input type="file"&gt;</code>. Each file can be up to ${limits.fileUploadMb} MB, with ${limits.submissionUploadMb} MB and ${LIMITS.maxFilesPerSubmission} files per submission. Files are stored with the submission, and your notification links to them rather than attaching them, so nobody’s inbox fills up.`;

export const platformGuides: Guide[] = [
  {
    slug: 'html-contact-form',
    kind: 'platform',
    name: 'Plain HTML',
    h1: 'A working HTML contact form, with no backend',
    title: 'HTML contact form that emails you, no backend',
    description: 'Copy a plain HTML contact form that sends submissions to your inbox. No server, no PHP, no JavaScript and no signup. Free and open source.',
    intro: 'An HTML form can’t send email by itself: it needs somewhere to post to. Point it at sendm8 and every submission lands in your inbox, with spam filtered out. No server, no PHP and no JavaScript required.',
    blocks: [
      { h2: 'The form' },
      { p: 'Paste this into any page and change <code>you@example.com</code> to your own address. That’s the whole setup.' },
      { code: htmlForm(), lang: 'html', filename: 'contact.html', highlight: [1] },
      { p: 'Every field with a <code>name</code> is delivered under that name, so add phone numbers, dropdowns or checkboxes the same way. Keep your own CSS: sendm8 never touches your page.' },
      { h2: 'What happens when someone submits' },
      { steps: [confirmStep, 'The visitor is sent to a plain thank-you page with a link back to your site. To send them to your own page instead, add a hidden <code>_next</code> field (below).', 'You get an email for each submission. Hitting reply answers whoever wrote in, because their <code>email</code> field becomes the Reply-To.'] },
      { h2: 'Your own thank-you page' },
      { p: 'Add a hidden field with the full address of a page on the same site. sendm8 answers the post with a redirect there, so refreshing never sends the form twice.' },
      { code: `<input type="hidden" name="_next" value="https://yoursite.com/thanks.html">\n<input type="hidden" name="_subject" value="New message from yoursite.com">`, lang: 'html', filename: 'contact.html' },
      { p: '<code>_subject</code> sets the subject line of the email you get. Both fields are removed before the submission is stored. To redirect to a different domain, sign in and add it to the form’s allowed domains first; that stops anyone using your form as an open redirect.' },
      { h2: 'Staying on the page' },
      { p: `If you’d rather show a message without leaving the page, add the helper script and a <code>data-sendm8</code> attribute. It sends the form in the background and swaps in your message. With JavaScript off, the form still posts normally.` },
      { code: `<script src="${HELPER}" defer></script>\n<form action="${EMAIL}" method="POST"\n      data-sendm8 data-sendm8-success="Thanks! I’ll get back to you soon.">`, lang: 'html', filename: 'contact.html', highlight: [1, 3] },
      { h2: 'Spam' },
      { p: `The hidden <code>_gotcha</code> field catches the simplest bots. Behind it, every submission is rate-limited (${limits.ratePerIpPerMinute} a minute per visitor), scored for links, known spam phrases and gibberish, and checked by a small AI model. Spam goes to a folder you can review instead of your inbox.` },
      { p: limitsPara },
    ],
    faq: [
      { q: 'Can an HTML form send an email without a server?', a: 'Not on its own. The browser can only post the form somewhere. A form backend such as sendm8 receives the post and emails it to you, so you don’t need a server or PHP.' },
      { q: 'Why not use mailto: as the form action?', a: 'A mailto: action opens the visitor’s email app instead of sending anything, and does nothing for people without one set up. Posting to a form backend works in every browser and needs nothing from the visitor.' },
      { q: 'Does the form need JavaScript?', a: 'No. A normal form post works with JavaScript turned off. The helper script is optional and only changes what the visitor sees after sending.' },
    ],
    related: { docs: ['basic-form', 'zero-signup', 'fields', 'redirects', 'spam'], vs: ['formsubmit', 'web3forms'] },
  },
  {
    slug: 'github-pages-contact-form',
    kind: 'platform',
    name: 'GitHub Pages',
    h1: 'Add a contact form to a GitHub Pages site',
    title: 'Contact form for GitHub Pages, free and no backend',
    description: 'GitHub Pages only serves static files, so forms need somewhere to post. Add a free contact form that emails you, with spam filtering and no signup.',
    intro: 'GitHub Pages serves static files and nothing else, so there’s no server to receive a form. You don’t need one: point the form at sendm8 and submissions are emailed to you. It works the same on a user site, an organisation site or a project site.',
    blocks: [
      { h2: 'Add the form' },
      { p: 'Create a page in your repository, for example <code>contact.html</code> at the root (or <code>docs/contact.html</code> if you publish from <code>/docs</code>), and paste the form. Change <code>you@example.com</code> to the address you want messages sent to.' },
      { code: htmlForm(), lang: 'html', filename: 'contact.html', highlight: [1] },
      { p: 'Commit and push. Once GitHub has rebuilt the site, open the page and send yourself a test message.' },
      { h2: 'Confirm your address once' },
      { steps: [confirmStep, 'Messages reach you from <code>notify@sendm8.com</code>, with the visitor’s address set as Reply-To.', 'Nothing else to set up: there are no keys to keep out of your public repository, because the endpoint only ever delivers to the confirmed address.'] },
      { note: 'Your email address is in the page source, which anyone can read on a public repository. If that bothers you, sign in, create a form in the dashboard and use its id instead: <code>https://sendm8.com/f/k3x9q2m7ab</code>. The address stays in your account.', title: 'Prefer not to publish your address?', kind: 'info' },
      { h2: 'Using Jekyll on GitHub Pages' },
      { p: 'GitHub Pages builds with Jekyll by default, and Jekyll passes raw HTML in Markdown straight through. So you can paste the form into <code>contact.md</code> under its front matter, or save it as <code>_includes/contact-form.html</code> and use <code>{% include contact-form.html %}</code> wherever you want it. The <a href="/guides/jekyll-contact-form/">Jekyll guide</a> covers that in more detail.' },
      { h2: 'Send visitors back to your site' },
      { p: 'Without anything extra, visitors see a short thank-you page with a link back. To use your own page, add a <code>_next</code> field pointing at it. Because it’s on the same site as the form, it works without any settings.' },
      { code: `<input type="hidden" name="_next" value="https://username.github.io/thanks.html">`, lang: 'html', filename: 'contact.html' },
      { p: 'For a project site, the page lives under the repository name, such as <code>https://username.github.io/my-project/thanks.html</code>. A custom domain works the same way: use the full address your visitors see.' },
      { h2: 'Spam and limits' },
      { p: `GitHub Pages sites get found by bots like any other site. The <code>_gotcha</code> honeypot, rate limits, spam scoring and an AI check run on every submission, and anything flagged waits in a spam folder rather than your inbox.` },
      { p: limitsPara },
    ],
    faq: [
      { q: 'Does GitHub Pages support forms?', a: 'GitHub Pages hosts the form’s HTML but can’t receive submissions, because it only serves static files. Point the form’s action at a form backend like sendm8 to receive them.' },
      { q: 'Is it safe to put the endpoint in a public repository?', a: 'Yes. The endpoint can only deliver to the address that confirmed it, so someone copying it can only send you messages. Spam filtering and rate limits still apply.' },
      { q: 'Does it work with a custom domain on GitHub Pages?', a: 'Yes. The form posts to sendm8 from whatever domain the page is on. Use your custom domain in any _next redirect.' },
    ],
    related: { docs: ['basic-form', 'zero-signup', 'redirects', 'spam'], vs: ['formspree', 'formsubmit'] },
  },
  {
    slug: 'astro-contact-form',
    kind: 'platform',
    name: 'Astro',
    h1: 'Contact form for an Astro site',
    title: 'Astro contact form without a server or adapter',
    description: 'Add a contact form to a static Astro site with no adapter, API route or server. Submissions are emailed to you, with optional fetch for an inline message.',
    intro: 'A static Astro build has no server to handle a POST, and adding an adapter just for one form is a lot of machinery. Post the form to sendm8 instead: it works with output: "static", needs no API route, and keeps working with JavaScript off.',
    blocks: [
      { h2: 'A component for the form' },
      { p: 'Create a component and use it on any page. Change <code>you@example.com</code> to your own address.' },
      {
        code: `
---
// src/components/ContactForm.astro
const endpoint = "${EMAIL}";
---
<form action={endpoint} method="POST">
  <label>Your email <input name="email" type="email" required /></label>
  <label>Message <textarea name="message" required></textarea></label>
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off" />
  <input type="hidden" name="_next" value={new URL("/thanks/", Astro.site).href} />
  <button>Send</button>
</form>`,
        lang: 'astro',
        filename: 'src/components/ContactForm.astro',
        highlight: [3, 9],
      },
      { p: 'The <code>_next</code> line sends visitors to your own <code>/thanks/</code> page and uses <code>site</code> from <code>astro.config.mjs</code>, so set that if you haven’t. Leave the line out and visitors see sendm8’s plain thank-you page instead.' },
      { h2: 'Confirm, then you’re done' },
      { steps: [confirmStep, 'Each submission arrives as an email with the visitor’s address as Reply-To.', `Because nothing runs on your side, it works the same on Netlify, Vercel, Cloudflare Pages or GitHub Pages, in <code>astro dev</code> and in production.`] },
      { h2: 'Show a message without leaving the page' },
      { p: 'Astro ships no JavaScript unless you ask, so add a small script to the component. It posts the form with <code>fetch</code> and asks for JSON back, and the form still posts normally if the script doesn’t run.' },
      {
        code: `
<script>
  const form = document.querySelector<HTMLFormElement>("form[action*='sendm8.com']")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const res = await fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" },
    });
    const result = await res.json();
    if (result.ok) form.replaceWith("Thanks! It’s on its way.");
    else alert(result.error.message);
  });
</script>`,
        lang: 'astro',
        filename: 'src/components/ContactForm.astro',
        highlight: [9],
      },
      { p: '<code>result.error.message</code> is a plain-English sentence you can show as it is, such as a rate-limit or a field that isn’t an email address. The <a href="/docs/ajax/">AJAX docs</a> list every response.' },
      { h2: 'Prefer not to put your address in the source?' },
      { p: 'Sign in and create a form in the dashboard. You get an id like <code>k3x9q2m7ab</code> to use instead of your address, plus allowed domains, Discord, Slack, Telegram and webhook delivery. Forms you’ve already made with your address move into your account when you sign in with it.' },
      { p: limitsPara },
    ],
    faq: [
      { q: 'Do I need an Astro adapter or SSR for a contact form?', a: 'No. The form posts straight to sendm8, so it works with a fully static Astro build and no adapter, API route or server action.' },
      { q: 'Will it work with Astro view transitions?', a: 'A normal form post works either way. If you use the fetch script with the ClientRouter, run it on the astro:page-load event so it’s attached again after each navigation.' },
      { q: 'Can I use it from a React, Vue or Svelte island instead?', a: 'Yes. Any island can post to the same endpoint, either as a plain form or with fetch. For React there’s the @sendm8/react package.' },
    ],
    related: { docs: ['basic-form', 'ajax', 'redirects', 'spam'], vs: ['formspree', 'web3forms'] },
  },
  {
    slug: 'hugo-contact-form',
    kind: 'platform',
    name: 'Hugo',
    h1: 'Contact form for a Hugo site',
    title: 'Hugo contact form with a shortcode, no server',
    description: 'Add a contact form to a Hugo site with a shortcode. Submissions are emailed to you, with spam filtering, no server and no signup. Works on any host.',
    intro: 'Hugo builds plain static files, so a contact form needs somewhere to post. The tidy way is a shortcode: write the form once, then drop it into any Markdown page. Submissions go to sendm8 and arrive in your inbox.',
    blocks: [
      { h2: 'Why not paste HTML into Markdown?' },
      { p: 'Since Hugo 0.60, the Goldmark renderer leaves raw HTML out of Markdown unless you turn on <code>markup.goldmark.renderer.unsafe</code>. A shortcode avoids that setting and keeps the form in one place.' },
      { h2: 'Create the shortcode' },
      { p: 'Save this as <code>layouts/shortcodes/contact-form.html</code>. Change <code>you@example.com</code> to your own address, or set it in your site config as shown below.' },
      {
        code: `
{{ $endpoint := site.Params.formEndpoint | default "${EMAIL}" }}
<form action="{{ $endpoint }}" method="POST">
  <label>Your email <input name="email" type="email" required></label>
  <label>Message <textarea name="message" required></textarea></label>
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="_next" value="{{ "thanks/" | absURL }}">
  <button>Send</button>
</form>`,
        lang: 'html',
        filename: 'layouts/shortcodes/contact-form.html',
        highlight: [1],
      },
      { p: 'Then use it in any content file:' },
      { code: `---\ntitle: "Contact"\n---\n\nGot a question? Send me a message.\n\n{{< contact-form >}}`, lang: 'markdown', filename: 'content/contact.md', highlight: [7] },
      { p: 'To keep the address in config instead of the template, add it to <code>hugo.toml</code>:' },
      { code: `[params]\n  formEndpoint = "${EMAIL}"`, lang: 'toml', filename: 'hugo.toml' },
      { h2: 'Confirm your address' },
      { steps: [confirmStep, 'The <code>_next</code> field sends visitors to <code>/thanks/</code> on your site, built from <code>baseURL</code>. Create that page, or remove the line to use sendm8’s plain thank-you page.', 'Messages arrive from <code>notify@sendm8.com</code>. Reply and you’re answering the visitor directly.'] },
      { h2: 'Themes that already have a contact form' },
      { p: 'Many Hugo themes ship a contact form with a configurable action, often a <code>params</code> entry named after Formspree. Set it to your sendm8 endpoint. sendm8 understands Formspree’s field names (<code>_replyto</code>, <code>_subject</code>, <code>_next</code>, <code>_gotcha</code>), so the theme’s form usually needs no other change.' },
      { h2: 'Taking file uploads' },
      { p: uploadsPara },
      { h2: 'Spam and limits' },
      { p: `Every submission is rate-limited, scored for spam signals and checked by a small AI model. Anything flagged goes to a spam folder rather than your inbox, and it’s deleted after ${limits.spamRetentionDays} days.` },
      { p: limitsPara },
    ],
    faq: [
      { q: 'Why does my form disappear when I paste it into a Hugo Markdown file?', a: 'Hugo’s Goldmark renderer drops raw HTML by default. Put the form in a shortcode, or set markup.goldmark.renderer.unsafe to true in your config.' },
      { q: 'Does it work with Hugo themes that support Formspree?', a: 'Usually, yes. Set the theme’s form action to your sendm8 endpoint. The Formspree-style underscore fields work the same way.' },
      { q: 'Does it work on Netlify, Cloudflare Pages or GitHub Pages?', a: 'Yes. The form posts to sendm8 directly, so it works on any static host.' },
    ],
    related: { docs: ['basic-form', 'fields', 'redirects', 'spam'], vs: ['formspree', 'getform'] },
  },
  {
    slug: 'jekyll-contact-form',
    kind: 'platform',
    name: 'Jekyll',
    h1: 'Contact form for a Jekyll site',
    title: 'Jekyll contact form with an include, no server',
    description: 'Add a contact form to a Jekyll site with an include. Submissions are emailed to you, with spam filtering and no server. Works on GitHub Pages too.',
    intro: 'Jekyll builds a static site, so it has nowhere to receive a form. Put the form in an include, point it at sendm8, and every submission arrives in your inbox. It works anywhere Jekyll does, GitHub Pages included.',
    blocks: [
      { h2: 'Create the include' },
      { p: 'Save the form as <code>_includes/contact-form.html</code>. The endpoint comes from <code>_config.yml</code>, so you can change it in one place.' },
      {
        code: `
<form action="{{ site.form_endpoint }}" method="POST">
  <label>Your email <input name="email" type="email" required></label>
  <label>Message <textarea name="message" required></textarea></label>
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="_next" value="{{ '/thanks/' | absolute_url }}">
  <button>Send</button>
</form>`,
        lang: 'liquid',
        filename: '_includes/contact-form.html',
        highlight: [1],
      },
      { code: `url: "https://yoursite.com"\nform_endpoint: "${EMAIL}"`, lang: 'yaml', filename: '_config.yml', highlight: [2] },
      { p: 'Change <code>you@example.com</code> to your own address. <code>absolute_url</code> builds the thank-you link from <code>url</code> (and <code>baseurl</code>, for project sites), so make sure those are set.' },
      { h2: 'Use it on a page' },
      { p: 'Jekyll’s kramdown passes HTML through, so the include works in Markdown and in layouts alike.' },
      { code: `---\nlayout: page\ntitle: Contact\npermalink: /contact/\n---\n\nSend me a message and I’ll get back to you.\n\n{% include contact-form.html %}`, lang: 'markdown', filename: 'contact.md', highlight: [9] },
      { p: 'Add a <code>thanks.md</code> with <code>permalink: /thanks/</code> for the page visitors land on, or remove the <code>_next</code> line to use sendm8’s plain thank-you page.' },
      { h2: 'Confirm your address once' },
      { steps: [confirmStep, 'Notifications come from <code>notify@sendm8.com</code>, with the visitor’s email as Reply-To.', 'Run <code>bundle exec jekyll serve</code> and the form works locally too: posts from localhost are always allowed.'] },
      { h2: 'Themes like Minima and Minimal Mistakes' },
      { p: 'Some themes have a contact form built in, often configured for Formspree. Point its action at your sendm8 endpoint. sendm8 accepts the same underscore fields (<code>_replyto</code>, <code>_subject</code>, <code>_next</code>, <code>_gotcha</code>, <code>_cc</code>), so the rest of the theme’s form can stay as it is.' },
      { h2: 'Taking file uploads' },
      { p: uploadsPara },
      { h2: 'Spam and limits' },
      { p: `The honeypot, rate limits, spam scoring and an AI check run on every submission. Flagged messages wait in a spam folder for ${limits.spamRetentionDays} days instead of reaching you.` },
      { p: limitsPara },
    ],
    faq: [
      { q: 'Can Jekyll handle form submissions?', a: 'No. Jekyll only generates static pages. Post the form to a form backend such as sendm8, which receives the submission and emails it to you.' },
      { q: 'Will this work on GitHub Pages?', a: 'Yes. GitHub Pages builds Jekyll sites, and the form posts straight to sendm8, so nothing extra runs on GitHub.' },
      { q: 'Can I send submissions to Slack or Discord instead?', a: 'Yes, once you sign in. Create the form in the dashboard and add Discord, Slack, Telegram or webhook channels to it.' },
    ],
    related: { docs: ['basic-form', 'fields', 'redirects', 'spam'], vs: ['formspree', 'formsubmit'] },
  },
  {
    slug: 'eleventy-contact-form',
    kind: 'platform',
    name: 'Eleventy',
    h1: 'Contact form for an Eleventy (11ty) site',
    title: 'Eleventy (11ty) contact form, no serverless function',
    description: 'Add a contact form to an Eleventy site with a reusable include and global data. Submissions are emailed to you, with no serverless function or signup.',
    intro: 'Eleventy outputs static HTML, so a form needs a backend to post to. Rather than writing a serverless function, point the form at sendm8: put the endpoint in global data, the form in an include, and use it on any page.',
    blocks: [
      { h2: 'Keep the endpoint in global data' },
      { code: `export default {\n  url: "https://yoursite.com",\n  formEndpoint: "${EMAIL}",\n};`, lang: 'js', filename: '_data/site.js', highlight: [3] },
      { p: 'Change <code>you@example.com</code> to your address. Using a CommonJS project? Write <code>module.exports = { … }</code> instead.' },
      { h2: 'The form as an include' },
      {
        code: `
<form action="{{ site.formEndpoint }}" method="POST">
  <label>Your email <input name="email" type="email" required></label>
  <label>Message <textarea name="message" required></textarea></label>
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="_next" value="{{ site.url }}/thanks/">
  <button>Send</button>
</form>`,
        lang: 'html',
        filename: '_includes/contact-form.html',
        highlight: [1],
      },
      { p: 'Use it from any template or Markdown page. Eleventy runs Markdown through Liquid first by default and lets HTML through, and the include is plain HTML, so it works the same from Liquid and Nunjucks:' },
      { code: `---\ntitle: Contact\nlayout: base.njk\n---\n\nSay hello.\n\n{% include "contact-form.html" %}`, lang: 'markdown', filename: 'contact.md', highlight: [8] },
      { p: 'Using Liquid or WebC instead? The form is plain HTML, so the same markup works in any template language; only the include syntax changes.' },
      { h2: 'Confirm and test' },
      { steps: [confirmStep, 'Run <code>npx @11ty/eleventy --serve</code> and send a test from localhost. Local posts are always allowed, so you can try it before you deploy.', 'Create a <code>thanks.md</code> page for the <code>_next</code> redirect, or remove that line to use sendm8’s own thank-you page.'] },
      { h2: 'An inline success message' },
      { p: 'To stay on the page after sending, add the helper script and <code>data-sendm8</code>. No build step and no bundler config: it’s a single script tag.' },
      { code: `<script src="${HELPER}" defer></script>\n<form action="{{ site.formEndpoint }}" method="POST"\n      data-sendm8 data-sendm8-success="Thanks! Speak soon.">`, lang: 'html', filename: '_includes/contact-form.html', highlight: [1, 3] },
      { h2: 'Taking file uploads' },
      { p: uploadsPara },
      { h2: 'Spam and limits' },
      { p: `Submissions are rate-limited, scored for spam and checked by a small AI model. Anything flagged goes to a spam folder, not your inbox, and nothing is ever dropped without a trace.` },
      { p: limitsPara },
    ],
    faq: [
      { q: 'Do I need Netlify Forms or a serverless function for an Eleventy form?', a: 'No. The form posts straight to sendm8, so it works on any host without a function, a build plugin or host-specific form handling.' },
      { q: 'Can I use it with Eleventy’s WebC or Liquid templates?', a: 'Yes. The form is plain HTML, so only the include syntax differs between template languages.' },
      { q: 'How do I keep my email address out of the HTML?', a: 'Sign in, create a form in the dashboard and use its id in formEndpoint. The address then stays in your account rather than in the page.' },
    ],
    related: { docs: ['basic-form', 'ajax-helper', 'redirects', 'spam'], vs: ['formspree', 'getform'] },
  },
  {
    slug: 'nextjs-static-export-contact-form',
    kind: 'platform',
    name: 'Next.js static export',
    h1: 'Contact form for a Next.js static export',
    title: 'Next.js static export contact form (output: export)',
    description: 'With output: "export", Next.js has no API routes or Server Actions. Add a contact form that posts to sendm8 instead: plain HTML or a client component.',
    intro: 'Set output: "export" and Next.js builds plain files, which means no API routes and no Server Actions to handle a form. Post the form to sendm8 instead. It works as a plain HTML form, or as a client component that shows its own success message.',
    blocks: [
      { h2: 'The simplest version: a plain form' },
      { p: 'This needs no client JavaScript and works in a Server Component. Change <code>you@example.com</code> to your address.' },
      {
        code: `
export default function ContactPage() {
  return (
    <form action="${EMAIL}" method="POST">
      <label>Your email <input name="email" type="email" required /></label>
      <label>Message <textarea name="message" required /></label>
      <input type="text" name="_gotcha" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
      <input type="hidden" name="_next" value="https://yoursite.com/thanks" />
      <button>Send</button>
    </form>
  );
}`,
        lang: 'tsx',
        filename: 'app/contact/page.tsx',
        highlight: [3],
      },
      { p: 'Because <code>action</code> is a URL string rather than a function, React leaves it as a normal HTML post, which is exactly what a static export needs.' },
      { h2: 'Staying on the page: a client component' },
      { p: 'For a success message without a page change, send the form with <code>fetch</code> and ask for JSON.' },
      {
        code: `
"use client";
import { useState } from "react";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const res = await fetch("${EMAIL}", {
      method: "POST",
      body: new FormData(event.currentTarget),
      headers: { Accept: "application/json" },
    });
    const result = await res.json();
    if (result.ok) setStatus("sent");
    else { setError(result.error.message); setStatus("idle"); }
  }

  if (status === "sent") return <p>Thanks! It’s on its way.</p>;
  return (
    <form onSubmit={onSubmit}>
      <input name="email" type="email" required />
      <textarea name="message" required />
      {error && <p role="alert">{error}</p>}
      <button disabled={status === "sending"}>Send</button>
    </form>
  );
}`,
        lang: 'tsx',
        filename: 'app/contact/ContactForm.tsx',
        highlight: [12, 15],
      },
      { p: 'Prefer a hook? <code>@sendm8/react</code> gives you <code>useForm</code> and <code>ValidationError</code> with the same API as <code>@formspree/react</code>.' },
      { h2: 'Confirm your address' },
      { steps: [confirmStep, 'Test with <code>next dev</code> before exporting: posts from localhost are always allowed.', 'After <code>next build</code>, the form in <code>out/</code> works on any static host: GitHub Pages, Cloudflare Pages, S3 or your own server.'] },
      { h2: 'Taking file uploads' },
      { p: `${uploadsPara} With the client component, <code>new FormData(event.currentTarget)</code> already includes the files; don’t set a <code>Content-Type</code> header yourself, or the browser can’t add the multipart boundary.` },
      { h2: 'Spam and limits' },
      { p: `Every submission is rate-limited, scored and AI-checked. Flagged messages go to a spam folder you can review. For a form that posts with fetch, you can add Cloudflare Turnstile yourself; the <a href="/docs/spam/">spam docs</a> show how.` },
      { p: limitsPara },
    ],
    faq: [
      { q: 'Can I use API routes or Server Actions with output: "export"?', a: 'No. A static export has no server at runtime, so API routes and Server Actions aren’t available. Posting the form to a form backend such as sendm8 replaces them.' },
      { q: 'Does this work with the Pages Router too?', a: 'Yes. Put the same form or client component in a page under pages/. Nothing here depends on the App Router.' },
      { q: 'Is there a React hook?', a: 'Yes, @sendm8/react has useForm and ValidationError with the same API as @formspree/react, so existing Formspree React code mostly needs only the form id changed.' },
    ],
    related: { docs: ['basic-form', 'ajax', 'spam', 'formspree'], vs: ['formspree', 'web3forms'] },
  },
];
