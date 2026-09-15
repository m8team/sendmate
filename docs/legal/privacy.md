<!-- Written for sendm8.com, run by m8team. Not legal advice. Self-hosting? Replace the operator details with your own. -->

# Privacy policy

_Last updated: 15 September 2026_

sendm8 ("we") is a free form backend operated by m8team, a small group of people based in the United Kingdom (hello@sendm8.com). m8team isn't a registered company. This policy covers two groups of people:

- **Form owners:** people who sign in to sendm8 or set up a form.
- **Visitors:** people who fill in a form that uses sendm8.

We don't sell data, show ads, or use form submissions to train AI models.

## What we collect

### When someone submits a form

- **The fields in the form**, exactly as submitted, plus any uploaded files (if the form owner enabled uploads).
- **Technical details:** a one-way hash of the IP address (we never store the raw IP), the country Cloudflare reports for the request, the browser's user agent, and the page the form was on (referrer).
- **Spam signals:** a spam score and the reasons for it.

Submissions belong to the form owner. We store them to deliver them and to show them in the owner's dashboard. If you submitted a form and want your data removed, contact the website owner. If you can't reach them, contact us.

### When you use the dashboard

- **Your account:** name, email address and profile picture from GitHub or Google, and which provider you used.
- **Sessions:** a session token, plus the IP address and user agent it was created from, so you can stay signed in securely.
- **Settings you give us:** notification email addresses, Discord/Slack/Telegram/webhook details, and your own Resend API key or Turnstile secret. Third-party secrets are encrypted at rest (AES-256-GCM).
- **Usage counters:** daily counts of submissions and emails, used to enforce fair-use limits.

### Zero-signup email endpoints

If a form posts to `sendm8.com/f/<your email>`, we store that address and email it **once** to ask whether you want the submissions. If you choose "Not me", the form is disabled, its stored messages are deleted, and we won't email you about it again.

### Abuse reports

If you report a form, we store your reason, any details you add, a hash of your IP address (to count distinct reporters), and your email address if you choose to give it.

### Error reports

If something breaks, in our servers or in your browser while you're on sendm8.com, we record the error message and technical details (where in the code it failed), the page path without any query string, and your browser name and version (for example "Firefox 130 on Linux"). Email addresses and tokens are removed first. We use this only to fix bugs.

## Who processes data for us

| Provider | What for |
|---|---|
| Cloudflare | Hosting, database (D1), file storage (R2), bot checks (Turnstile), and AI spam checks if a form owner turns them on (Workers AI) |
| Resend | Sending notification, digest and verification emails |
| GitHub / Google | Signing in |
| Discord, Slack, Telegram, or any webhook URL | Only where a form owner connected them. Submissions are sent there on the owner's instruction. |
| Discord | Private alerts to m8team about the service: new sign-ups and forms (names, with email addresses partly hidden), forms flagged for abuse, and errors. Never the contents of submissions. |

If a form owner uses their own Resend key, emails for their forms are sent through their Resend account.

## How long we keep things

- **Submissions and files:** until the form owner deletes them, deletes the form, or closes their account.
- **Submissions marked as spam:** deleted automatically after 30 days.
- **Unfinished bot checks:** deleted after 1 day.
- **Usage counters:** about 100 days.
- **Error reports:** deleted 30 days after the error was last seen.
- **Links in notification emails and webhooks** to download files expire after 7 days.

## Your rights

You can export your submissions (CSV or JSON) and delete submissions, forms and connected services from the dashboard at any time. To delete your account or exercise other rights (access, correction, deletion, objection), email hello@sendm8.com. If you're in the UK or EU you can also complain to your data protection authority.

## Cookies

The dashboard uses a single essential session cookie to keep you signed in. There are no analytics or advertising cookies. Turnstile may set cookies needed for bot checks on the challenge and report pages.

## Changes

We'll post changes here and update the date above. For significant changes, we'll email signed-in users.
