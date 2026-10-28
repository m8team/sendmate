import { LIMITS } from '@sendm8/shared';
import { limits, site } from '../site';
import type { Guide } from './types';

/** Channels need a dashboard form, so these guides use a form id rather than an email address. */
const FORM = `${site.endpointBase}k3x9q2m7ab`;
const retries = limits.retrySchedule.join(', ');

const form = `
<form action="${FORM}" method="POST">
  <label>Name <input name="name" required></label>
  <label>Email <input name="email" type="email" required></label>
  <label>Message <textarea name="message" required></textarea></label>
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <button>Send</button>
</form>`;

const accountStep = `Sign in to sendm8 with GitHub or Google and create a form. You get an endpoint like <code>${FORM}</code>. (Email-in-the-URL endpoints deliver by email only; channels like this one live on dashboard forms.)`;
const channelsPara = `Each form can have up to ${LIMITS.maxChannelsPerForm} channels, so the same submission can go to email, Discord, Slack, Telegram and a webhook at once. Chat and webhook deliveries are unlimited and don’t count towards the daily email allowance. A failed delivery is retried after ${retries}, and the dashboard shows each attempt on the submission.`;

export const destinationGuides: Guide[] = [
  {
    slug: 'html-form-to-discord',
    kind: 'destination',
    name: 'Discord',
    h1: 'Send HTML form submissions to Discord',
    title: 'Send an HTML form to a Discord channel',
    description: 'Post every contact form submission to a Discord channel with a webhook. No bot to host, no code: a free form backend with spam filtering built in.',
    intro: 'Want new enquiries to ping a Discord channel instead of sitting in an inbox? sendm8 posts each submission to Discord through a channel webhook. There’s no bot to run, no permissions to grant beyond the webhook, and no code on your side.',
    blocks: [
      { h2: 'What you need' },
      { p: 'A Discord server where you have the <strong>Manage Webhooks</strong> permission, and a free sendm8 account.' },
      { h2: 'Set it up' },
      {
        steps: [
          accountStep,
          'In Discord, open the server menu and go to <strong>Server Settings → Integrations → Webhooks → New Webhook</strong>. Name it, choose the channel submissions should go to, and click <strong>Copy Webhook URL</strong>.',
          'In sendm8, open the form’s <strong>Settings → Channels</strong>, add a Discord channel and paste the URL. It starts with <code>https://discord.com/api/webhooks/</code>.',
          'Click <strong>Send test</strong>. A test message appears in the channel within a couple of seconds.',
        ],
      },
      { h2: 'The form' },
      { p: 'Point any form at the endpoint. Every named field shows up in the Discord message.' },
      { code: form, lang: 'html', filename: 'contact.html', highlight: [1] },
      { h2: 'What arrives in Discord' },
      { p: 'Each submission becomes one message with the form’s fields laid out as a card, a link to the submission in your dashboard, and download links for any uploaded files. The message doesn’t mention <code>@everyone</code> or anyone else, whatever a visitor types into the form, so nobody can use your form to ping your whole server.' },
      { note: 'Spam is caught before delivery: the honeypot, rate limits, spam scoring and an AI check all run first, and flagged submissions go to the spam folder instead of your channel. Your Discord stays free of bot junk.', title: 'Only real messages reach the channel', kind: 'info' },
      { h2: 'Discord as well as email, or instead of it' },
      { p: `${channelsPara} If Discord is where you’d rather hear about everything, remove the email channel from the form and keep just Discord.` },
      { h2: 'Why a webhook and not a bot?' },
      { p: 'A channel webhook can only post to the one channel it was created for. It can’t read messages, join other channels or act as a member of your server, so it’s the least access a form needs. If you ever want it gone, delete the webhook in Discord and deliveries stop.' },
      { p: 'Rather do something fancier, like threads per enquiry or slash-command replies? Use a <a href="/guides/html-form-to-webhook/">webhook</a> to your own bot instead: sendm8 posts signed JSON and your code takes it from there.' },
    ],
    faq: [
      { q: 'Can an HTML form post directly to a Discord webhook?', a: 'Not reliably. Discord expects a JSON body in its own format, a plain form post doesn’t send that, and putting the webhook URL in your page lets anyone spam the channel. A form backend receives the post, filters spam and sends Discord the right format.' },
      { q: 'Is Discord delivery free?', a: 'Yes. Discord, Slack, Telegram and webhook deliveries are unlimited on every sendm8 account.' },
      { q: 'Do I need a Discord bot?', a: 'No. sendm8 uses a channel webhook, which you create in Server Settings → Integrations. No bot to invite or host.' },
    ],
    related: { docs: ['discord', 'spam', 'uploads'], vs: ['formspree', 'web3forms'] },
  },
  {
    slug: 'html-form-to-slack',
    kind: 'destination',
    name: 'Slack',
    h1: 'Send HTML form submissions to Slack',
    title: 'Send an HTML form to a Slack channel',
    description: 'Post contact form submissions to a Slack channel with an incoming webhook. No Slack app to build and no server. Free, with spam filtering included.',
    intro: 'Leads and support requests are easier to act on when they land in the channel your team already watches. sendm8 posts each submission to Slack through an incoming webhook, so there’s no Slack app to build and nothing to host.',
    blocks: [
      { h2: 'What you need' },
      { p: 'A Slack workspace where you can add apps (or ask an admin to), and a free sendm8 account.' },
      { h2: 'Set it up' },
      {
        steps: [
          accountStep,
          'In Slack, add the <strong>Incoming Webhooks</strong> app to your workspace (or create an app with incoming webhooks turned on), choose the channel, and copy the webhook URL. It starts with <code>https://hooks.slack.com/services/</code>.',
          'In sendm8, open the form’s <strong>Settings → Channels</strong>, add a Slack channel and paste the URL.',
          'Click <strong>Send test</strong> and check the channel.',
        ],
      },
      { p: 'sendm8 also accepts Slack Workflow Builder webhook URLs (<code>hooks.slack.com/workflows/…</code> and <code>/triggers/…</code>), if you’d rather route submissions through a workflow.' },
      { h2: 'The form' },
      { code: form, lang: 'html', filename: 'contact.html', highlight: [1] },
      { p: 'Every named field is included in the Slack message. Add a hidden <code>_subject</code> field if you have several forms posting to one channel, so you can tell them apart at a glance.' },
      { h2: 'What arrives in Slack' },
      { p: 'One message per submission, with the fields listed, a link to the full submission in your dashboard and download links for any files. Text from the form is escaped before it’s sent, so a visitor can’t ping <code>@channel</code> or inject links that look like they came from you.' },
      { note: 'The honeypot, rate limits, spam scoring and an AI check all run before anything is delivered. Flagged submissions wait in the spam folder, where you can rescue a false positive, instead of interrupting your team.', title: 'Spam never reaches the channel', kind: 'info' },
      { h2: 'Slack and email together' },
      { p: channelsPara },
      { h2: 'Keeping the webhook URL private' },
      { p: 'Anyone with a Slack webhook URL can post to that channel, which is why it should never go in your page’s HTML. With sendm8 the URL is stored encrypted in your account, and your page only ever contains the form endpoint. If a webhook leaks some other way, remove it in Slack and add a fresh one in sendm8.' },
    ],
    faq: [
      { q: 'Can I post a form straight to a Slack webhook from the browser?', a: 'You shouldn’t. Slack expects JSON in its own format, browsers block most cross-site requests to it, and the webhook URL would be visible in your page for anyone to abuse. A form backend keeps the URL private and filters spam first.' },
      { q: 'Does it cost anything to send submissions to Slack?', a: 'No. Slack, Discord, Telegram and webhook deliveries are unlimited on every sendm8 account.' },
      { q: 'Can different forms go to different Slack channels?', a: 'Yes. Each form has its own channels, so give each one a webhook for the channel it should post to.' },
    ],
    related: { docs: ['discord', 'spam', 'fields'], vs: ['formspree', 'getform'] },
  },
  {
    slug: 'html-form-to-telegram',
    kind: 'destination',
    name: 'Telegram',
    h1: 'Send HTML form submissions to Telegram',
    title: 'Send an HTML form to Telegram with a bot',
    description: 'Get contact form submissions as Telegram messages from your own bot, in a private chat or a group. No server and no code. Free, with spam filtering.',
    intro: 'Telegram is a handy place for form notifications: they reach your phone instantly and are easy to share with a group. sendm8 sends each submission through a Telegram bot you create, so the messages come from your bot, into the chat you choose.',
    blocks: [
      { h2: 'What you need' },
      { p: 'A Telegram account and a free sendm8 account. Creating a bot takes a minute and costs nothing.' },
      { h2: 'Create the bot' },
      {
        steps: [
          'In Telegram, message <strong>@BotFather</strong>, send <code>/newbot</code> and follow the prompts. It replies with a bot token that looks like <code>123456789:AAH…</code>. Keep it private.',
          'Decide where messages should go. For a private chat, open your new bot and press <strong>Start</strong>. For a group, add the bot to the group.',
          'Find the chat id: send a message in that chat, then open <code>https://api.telegram.org/bot&lt;your token&gt;/getUpdates</code> in a browser and look for <code>"chat":{"id":…}</code>. Private chats have positive ids; groups have negative ones, like <code>-1001234567890</code>.',
        ],
      },
      { h2: 'Connect it to your form' },
      {
        steps: [
          accountStep,
          'Open the form’s <strong>Settings → Channels</strong>, add a Telegram channel, and paste the bot token and chat id. sendm8 checks the bot can see that chat before saving it.',
          'Click <strong>Send test</strong>. Your bot should message the chat straight away.',
        ],
      },
      { h2: 'The form' },
      { code: form, lang: 'html', filename: 'contact.html', highlight: [1] },
      { h2: 'What arrives' },
      { p: 'Your bot sends one message per submission, with each field on its own line, a link to the submission in your dashboard and download links for any uploaded files. Field values are escaped, so nothing a visitor types can change the formatting or hide a link.' },
      { note: 'Your bot token is stored encrypted and is only ever used to send messages to the chat you chose. It never appears in your page or in submission data.', title: 'Where the token lives', kind: 'info' },
      { h2: 'Spam stays out of your chat' },
      { p: `The honeypot, rate limits (${limits.ratePerIpPerMinute} submissions a minute per visitor), spam scoring and an AI check run before delivery. Flagged submissions go to the spam folder in your dashboard instead of buzzing your phone.` },
      { h2: 'Telegram alongside email and other channels' },
      { p: channelsPara },
    ],
    faq: [
      { q: 'Why does sendm8 need my own bot instead of a shared one?', a: 'Your own bot means messages come from a bot you control, into chats you choose, and you can revoke it at any time with @BotFather. A shared bot would be able to see every customer’s chats.' },
      { q: 'Can submissions go to a Telegram group or channel?', a: 'Yes. Add your bot to the group, or as an admin of the channel, and use that chat’s id. Group and channel ids are negative numbers.' },
      { q: 'Is Telegram delivery free?', a: 'Yes. Telegram, Discord, Slack and webhook deliveries are unlimited on every sendm8 account.' },
    ],
    related: { docs: ['discord', 'spam', 'uploads'], vs: ['formspree', 'web3forms'] },
  },
  {
    slug: 'html-form-to-webhook',
    kind: 'destination',
    name: 'a webhook',
    h1: 'Send HTML form submissions to a webhook',
    title: 'Send an HTML form to a webhook as signed JSON',
    description: 'Receive every form submission as signed JSON at your own URL, with retries and HMAC verification. Connect forms to your app, Zapier-style tools or a CRM.',
    intro: 'A webhook turns a form into an event your own code can act on: add a lead to your CRM, open a ticket, kick off a workflow. sendm8 POSTs each submission to your URL as JSON, signs it so you can check it’s genuine, and retries if your server is down.',
    blocks: [
      { h2: 'Set it up' },
      {
        steps: [
          accountStep,
          'Open the form’s <strong>Settings → Channels</strong> and add a webhook with your URL. It must be <code>https</code> and reachable from the internet: private IP ranges and bare IP addresses are refused.',
          'Copy the signing secret it shows you, and store it with your app (for example as <code>SENDM8_WEBHOOK_SECRET</code>).',
          'Click <strong>Send test</strong> to send a sample request.',
        ],
      },
      { h2: 'The form' },
      { code: form, lang: 'html', filename: 'contact.html', highlight: [1] },
      { h2: 'What your endpoint receives' },
      { p: 'A <code>POST</code> with a JSON body. Your field names are kept as they are in <code>data</code>:' },
      {
        code: `
{
  "event": "submission.created",
  "id": "01K53N7XQ2R8M4DE7Q2K9F4X3M",
  "tracking": "SM8 7Q2K 9F4X 3M",
  "created_at": "2026-09-14T15:42:07Z",
  "form": { "id": "k3x9q2m7ab", "name": "Studio contact" },
  "data": {
    "name": "Alex Moreno",
    "email": "alex@moreno.dev",
    "message": "Hiya! Are you free for a quick project in October?"
  },
  "files": [],
  "spam": { "score": 0.04, "verdict": "ok" }
}`,
        lang: 'json',
        filename: 'POST body',
      },
      { h2: 'Check the signature' },
      { p: 'Anyone can post to a public URL, so verify each request. The <code>X-Sendm8-Signature</code> header holds a Unix timestamp <code>t</code> and a signature <code>v1</code>: an HMAC-SHA256, in hex, of the timestamp, a full stop and the raw body, keyed with your signing secret.' },
      {
        code: `
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySendm8(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=")));
  const t = Number(parts.t);
  if (!t || !parts.v1) return false;
  // Refuse old deliveries, so a captured request can't be replayed
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;

  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}`,
        lang: 'js',
        filename: 'verify.js',
      },
      { p: 'Check the signature against the raw body, before any JSON parsing changes it. The <a href="/docs/webhooks/">webhook docs</a> have a complete handler.' },
      { h2: 'Retries and duplicates' },
      { p: `Answer with any 2xx within ${limits.webhookTimeoutSeconds} seconds, and do slow work after responding. On an error or timeout, sendm8 tries again after ${retries}. Each retry carries a fresh timestamp and signature, so use the submission <code>id</code> to skip anything you’ve already handled.` },
      { h2: 'No-code tools' },
      { p: 'Services such as Zapier, Make and n8n give you a “catch hook” URL. Paste it in as the webhook and map the <code>data</code> fields to the next step. Most of those tools can’t check the signature, so treat their URL like a password.' },
      { p: `Spam is filtered before delivery, so your endpoint only sees submissions that passed the honeypot, rate limits, spam scoring and AI check. The same submission can go to email and chat channels too: a form can have up to ${LIMITS.maxChannelsPerForm} channels.` },
    ],
    faq: [
      { q: 'Is the webhook payload signed?', a: 'Yes. Each request has an X-Sendm8-Signature header with a timestamp and an HMAC-SHA256 of the timestamp and raw body, keyed with your signing secret.' },
      { q: 'What happens if my server is down?', a: `sendm8 retries after ${retries}. Every attempt is shown on the submission in your dashboard, and the submission itself is stored either way.` },
      { q: 'Can I use a webhook with Zapier, Make or n8n?', a: 'Yes. Paste the catch-hook URL those tools give you as the webhook URL, then map the data fields in your workflow.' },
    ],
    related: { docs: ['webhooks', 'spam', 'ajax'], vs: ['formspree', 'getform'] },
  },
];
