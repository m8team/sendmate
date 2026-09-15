import type { AbuseReason } from "@sendm8/shared";
import { and, countDistinct, eq, gt, isNull } from "drizzle-orm";
import { createRouter } from "../app";
import { getLimits } from "../config";
import { getDb } from "../db/client";
import { abuseReports, forms } from "../db/schema";
import { hashIp } from "../lib/crypto";
import { clientIp, escapeHtml } from "../lib/http";
import { FORM_ID_PATTERN, newId } from "../lib/ids";
import { REPORT_ACTION, TURNSTILE_SCRIPT, turnstileEnabled, verifyTurnstile } from "../lib/turnstile";
import { renderPage, stamp } from "../pages/layout";
import { isEmail } from "../pipeline/deliver";

export const reportRoutes = createRouter();

const REASONS: Record<AbuseReason, string> = {
  phishing: "Phishing: it asks for passwords, card details or other credentials",
  spam: "Spam: I'm getting unwanted messages from it",
  malware: "Malware or scams",
  impersonation: "It pretends to be a company or person it isn't",
  other: "Something else",
};

const REPORT_WINDOW_MS = 7 * 86_400_000;

function reportForm(env: Env, values: { form?: string; reason?: string; details?: string; email?: string }, error?: string) {
  const field = "display:block;width:100%;margin:6px 0 16px;padding:10px;font:inherit;border:2px solid currentColor;background:transparent;color:inherit";
  const options = (Object.entries(REASONS) as [AbuseReason, string][])
    .map(
      ([value, label]) =>
        `<label style="display:block;margin:6px 0"><input type="radio" name="reason" value="${value}" ${values.reason === value ? "checked" : ""} required> ${escapeHtml(label)}</label>`,
    )
    .join("");
  return renderPage({
    status: error ? 400 : 200,
    title: "Report abuse",
    heading: "Report a form.",
    head: turnstileEnabled(env) ? `<script src="${TURNSTILE_SCRIPT}" async defer></script>` : "",
    body: `${stamp("Abuse desk")}
<p>Seen a sendm8 form being used for something dodgy? Tell us and we'll look into it.</p>
${error ? `<p role="alert" style="color:var(--signal)">${escapeHtml(error)}</p>` : ""}
<form method="POST" action="/report">
<label>Form ID or endpoint<input name="form" value="${escapeHtml(values.form ?? "")}" required maxlength="200" style="${field}"></label>
<fieldset style="border:0;padding:0;margin:0 0 16px"><legend>What's wrong?</legend>${options}</fieldset>
<label>Details (optional)<textarea name="details" maxlength="2000" rows="4" style="${field}">${escapeHtml(values.details ?? "")}</textarea></label>
<label>Your email (optional, only if you're happy for us to follow up)<input name="email" type="email" value="${escapeHtml(values.email ?? "")}" maxlength="254" style="${field}"></label>
${turnstileEnabled(env) ? `<div class="cf-turnstile" data-sitekey="${escapeHtml(env.TURNSTILE_SITE_KEY)}" data-action="${REPORT_ACTION}"></div>` : ""}
<p><button type="submit" style="font:700 16px/1 system-ui,sans-serif;padding:14px 22px;background:#141414;color:#f4efe6;border:0;cursor:pointer;margin-top:16px">Send report</button></p>
</form>`,
  });
}

reportRoutes.get("/", (c) => reportForm(c.env, { form: c.req.query("form") }));

/** Accepts a bare form id or a pasted endpoint URL. */
function extractFormId(value: string): string | null {
  const match = value.trim().toLowerCase().match(/([0-9a-z]{10})\/?$/);
  return match && FORM_ID_PATTERN.test(match[1]!) ? match[1]! : null;
}

reportRoutes.post("/", async (c) => {
  const env = c.env;
  const body = await c.req.parseBody();
  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");
  const values = { form: str("form"), reason: str("reason"), details: str("details").slice(0, 2000), email: str("email") };

  const ip = clientIp(c.req.raw);
  const ipHash = await hashIp(env.IP_HASH_SECRET, ip);
  const limited = await env.RL_PUBLIC_ACTIONS?.limit({ key: `report:${ipHash ?? "unknown"}` });
  if (limited?.success === false) return reportForm(env, values, "You've sent a few reports already. Give it a minute.");

  const formId = extractFormId(values.form);
  if (!formId) return reportForm(env, values, "That doesn't look like a sendm8 form ID or endpoint.");
  if (!(values.reason in REASONS)) return reportForm(env, values, "Pick what's wrong with the form.");
  if (values.email && !isEmail(values.email)) return reportForm(env, values, "That email address doesn't look right.");

  if (turnstileEnabled(env)) {
    const token = typeof body["cf-turnstile-response"] === "string" ? body["cf-turnstile-response"] : undefined;
    const result = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, { remoteIp: ip, expectedAction: REPORT_ACTION, expectedHostname: new URL(env.APP_URL).hostname });
    if (!result.success) return reportForm(env, values, "Please complete the check before sending.");
  }

  const db = getDb(env);
  const form = await db.select().from(forms).where(eq(forms.id, formId)).get();
  if (!form) return reportForm(env, values, "We couldn't find a form with that ID.");

  const now = Date.now();
  await db.insert(abuseReports).values({
    id: newId(),
    formId,
    reason: values.reason as AbuseReason,
    details: values.details || null,
    reporterEmail: values.email ? values.email.toLowerCase() : null,
    ipHash,
    createdAt: now,
  });

  // Enough independent reporters (since any admin review) flags the form: submissions are held until reviewed.
  if (!form.flaggedReason) {
    const since = Math.max(now - REPORT_WINDOW_MS, form.reviewedAt ?? 0);
    const reporters = await db
      .select({ n: countDistinct(abuseReports.ipHash) })
      .from(abuseReports)
      .where(and(eq(abuseReports.formId, formId), gt(abuseReports.createdAt, since), isNull(abuseReports.resolvedAt)))
      .get();
    if ((reporters?.n ?? 0) >= getLimits(env).reportsToAutoFlag) {
      await db.update(forms).set({ flaggedReason: "reported" }).where(eq(forms.id, formId));
    }
  }

  return renderPage({
    title: "Report received",
    heading: "Cheers. We're on it.",
    body: `${stamp("Received")}<p>Thanks for looking out for people. We review every report.</p>`,
  });
});
