import { and, eq } from "drizzle-orm";
import { createRouter } from "../app";
import { getDb } from "../db/client";
import { forms, submissions } from "../db/schema";
import { hashIp } from "../lib/crypto";
import { clientIp, escapeHtml } from "../lib/http";
import { CHALLENGE_ACTION, TURNSTILE_SCRIPT, turnstileEnabled, verifyTurnstile } from "../lib/turnstile";
import { renderPage, stamp } from "../pages/layout";
import { dispatchStored } from "../pipeline/zero-signup";
import { thanksUrl } from "./submit";

export const challengeRoutes = createRouter();

/** Visitors have an hour to pass the check; cleanup removes stale ones later. */
export const CHALLENGE_TTL_MS = 60 * 60 * 1000;

async function loadPending(env: Env, id: string) {
  const row = await getDb(env)
    .select({ submission: submissions, form: forms })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(eq(submissions.id, id))
    .get();
  if (!row || row.submission.status !== "pending_challenge" || Date.now() - row.submission.createdAt > CHALLENGE_TTL_MS) return null;
  return row;
}

function expiredPage() {
  return renderPage({
    status: 410,
    title: "Link expired",
    heading: "This check has expired.",
    body: `${stamp("Expired")}<p>Head back to the form and send your message again.</p>`,
  });
}

function challengePage(env: Env, id: string, formName: string, error?: string) {
  return renderPage({
    status: error ? 400 : 200,
    title: "One quick check",
    heading: "One quick check.",
    head: `<script src="${TURNSTILE_SCRIPT}" async defer></script>`,
    body: `${stamp("Nearly sent")}
<p>Your message to <strong>${escapeHtml(formName)}</strong> is ready to go. We just need to make sure you're human.</p>
${error ? `<p role="alert" style="color:var(--signal)">${escapeHtml(error)}</p>` : ""}
<form method="POST" action="/c/${escapeHtml(id)}" id="challenge">
<div class="cf-turnstile" data-sitekey="${escapeHtml(env.TURNSTILE_SITE_KEY)}" data-action="${CHALLENGE_ACTION}" data-callback="sendm8Passed"></div>
<noscript><p>This check needs JavaScript. Please enable it and reload.</p></noscript>
<p><button type="submit" style="font:700 16px/1 system-ui,sans-serif;padding:14px 22px;background:#141414;color:#f4efe6;border:0;cursor:pointer;margin-top:16px">Send my message</button></p>
</form>
<script>function sendm8Passed(){document.getElementById("challenge").submit()}</script>`,
  });
}

challengeRoutes.get("/:id", async (c) => {
  const row = await loadPending(c.env, c.req.param("id"));
  if (!row || !turnstileEnabled(c.env)) return expiredPage();
  return challengePage(c.env, row.submission.id, row.form.name);
});

challengeRoutes.post("/:id", async (c) => {
  const env = c.env;
  const row = await loadPending(env, c.req.param("id"));
  if (!row || !turnstileEnabled(env)) return expiredPage();

  const ip = clientIp(c.req.raw);
  const limited = await env.RL_PUBLIC_ACTIONS?.limit({ key: `challenge:${(await hashIp(env.IP_HASH_SECRET, ip)) ?? "unknown"}` });
  if (limited?.success === false) return challengePage(env, row.submission.id, row.form.name, "Too many attempts. Wait a minute and try again.");

  const body = await c.req.parseBody();
  const token = typeof body["cf-turnstile-response"] === "string" ? body["cf-turnstile-response"] : undefined;
  const result = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, {
    remoteIp: ip,
    expectedAction: CHALLENGE_ACTION,
    expectedHostname: new URL(env.APP_URL).hostname,
  });
  if (!result.success) {
    const message = result.unavailable ? "We couldn't run the check just now. Please try again." : "That didn't pass. Please try the check again.";
    return challengePage(env, row.submission.id, row.form.name, message);
  }

  const { next, ...meta } = row.submission.meta;
  // Conditional update so a double-submit can't release (and deliver) twice.
  const released = await getDb(env)
    .update(submissions)
    .set({ status: "ok", meta })
    .where(and(eq(submissions.id, row.submission.id), eq(submissions.status, "pending_challenge")))
    .returning({ id: submissions.id })
    .get();

  if (released) {
    c.executionCtx.waitUntil(dispatchStored(env, row.form, released.id, meta.referrer).catch((error) => console.error("dispatch failed", released.id, error)));
  }
  return c.redirect(next ?? thanksUrl(env.APP_URL, meta.referrer ?? undefined), 303);
});
