// Optional bindings that aren't in wrangler.jsonc by default, so `wrangler types` doesn't know them.
interface OptionalBindings {
  // Settings that are optional secrets in production (see .dev.vars.example).
  APP_URL: string;
  EMAIL_FROM?: string;
  ADMIN_EMAILS?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  DEV_LOGIN?: string;
  /** R2 bucket for file uploads. Uploads are ignored when it isn't bound. */
  FILES?: R2Bucket;
  /** Discord/Slack-compatible webhook that receives free-tier usage alerts (set as a secret). */
  ALERT_WEBHOOK_URL?: string;
  /** Workers AI, for optional per-form AI spam scoring. */
  AI?: Ai;
}

interface Env extends OptionalBindings {}

declare namespace Cloudflare {
  interface Env extends OptionalBindings {}
}
