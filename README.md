# sendm8

Free, open-source form backend. Point any HTML form at sendm8 and get your submissions: no server, no paywall.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/m8team/sendmate)

```html
<form action="https://sendm8.com/f/you@example.com" method="POST">
  <input name="email" type="email" required>
  <textarea name="message"></textarea>
  <input type="text" name="_gotcha" style="display:none">
  <button>Send</button>
</form>
```

The first submission to an email endpoint asks you to confirm. Sign in to get a private form ID, an inbox and more.

Moving from Formspree? Change the `action` URL. `_replyto`, `_subject`, `_next`, `_gotcha` and `_cc` work the same.

## Features

- **Delivery:** email (instant, or a daily digest), Discord, Slack, Telegram, and signed webhooks, with automatic retries
- **Bring your own Resend key** for unlimited email notifications
- **Spam protection:** honeypots, heuristics, a Turnstile challenge page (or your own Turnstile widget), rate limits, blocklists
- **Abuse protection:** forms that collect passwords or card details are held for review, a public report page, admin tools
- **Dashboard:** inbox with search, filters, bulk actions, and CSV/JSON export
- **File uploads** to R2 with hard storage caps (optional)
- **Zero-signup endpoints** that you can claim later
- Runs entirely on the **Cloudflare free plan**, with usage alerts and load shedding built in

## Repo

| Path | What |
|---|---|
| `worker/` | Cloudflare Worker: submission endpoint, delivery, dashboard API, auth, cron jobs |
| `web/` | Astro + Vue site and dashboard, served by the Worker as static assets |
| `wrangler.jsonc` | Worker config (at the root so "Deploy to Cloudflare" works) |
| `packages/shared/` | Limits and API types shared by both |
| `docs/` | [Self-hosting](docs/self-hosting.md), [webhooks](docs/webhooks.md) |

## Development

```sh
npm install
cp .dev.vars.example .dev.vars   # fill in secrets, uncomment the local-only lines
npm run db:migrate:local -w worker
npm run dev                       # http://localhost:8787 (Dev sign-in on the sign-in page)
npm test                          # worker + web tests
npm run test:coverage             # fails below 70% coverage
```

## License

[AGPL-3.0](LICENSE)
