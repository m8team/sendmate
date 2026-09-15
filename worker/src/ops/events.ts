import { waitUntil } from "cloudflare:workers";
import { count } from "drizzle-orm";
import type { FormRow } from "../db/client";
import { getDb } from "../db/client";
import { user } from "../db/schema";
import { maskEmail, notifyOps, notifyOpsLater, plain, type AlertEnv } from "./alerts";

/** The alerts sendm8 posts about what's happening on the instance. Each sends after the response. */

/** Sign-ups include the running total of accounts, which costs a read, so the whole alert is built in the background. */
export function alertSignup(env: AlertEnv, created: { name: string; email: string }) {
  if (!env.ALERT_WEBHOOK_URL) return;
  waitUntil(signupAlert(env, created));
}

export async function signupAlert(env: AlertEnv, created: { name: string; email: string }) {
  const total = await getDb(env)
    .select({ n: count() })
    .from(user)
    .get()
    .catch(() => undefined);
  return notifyOps(env, {
    kind: "signup",
    title: "New sign-up",
    fields: [
      { name: "Name", value: plain(created.name || "—", 100) },
      { name: "Email", value: maskEmail(created.email) },
      ...(total ? [{ name: "Accounts", value: total.n.toLocaleString("en-GB") }] : []),
    ],
    path: "/app/admin",
  });
}

export function alertFormCreated(env: AlertEnv, form: Pick<FormRow, "id" | "name" | "ownerEmail">, via: { ownerEmail: string | null; endpoint: "dashboard" | "email"; site?: string | null }) {
  const zeroSignup = via.endpoint === "email";
  notifyOpsLater(env, {
    kind: "form_created",
    title: zeroSignup ? "New email endpoint form (waiting for confirmation)" : "New form",
    fields: [
      // Zero-signup form names contain the address, so they're not repeated here.
      { name: "Form", value: zeroSignup ? form.id : `${plain(form.name, 100)} (${form.id})` },
      { name: "Owner", value: maskEmail(via.ownerEmail) },
      ...(via.site ? [{ name: "Site", value: plain(via.site, 100) }] : []),
    ],
  });
}

export function alertFormFlagged(env: AlertEnv, form: Pick<FormRow, "id" | "name">, reporters: number, reason: string) {
  notifyOpsLater(env, {
    kind: "form_flagged",
    title: "Form flagged by abuse reports",
    description: "Its submissions are held until an admin reviews it.",
    fields: [
      { name: "Form", value: `${plain(form.name, 100)} (${form.id})` },
      { name: "Reporters", value: String(reporters) },
      { name: "Latest reason", value: reason },
    ],
    path: "/app/admin#ad-reports",
    dedupeKey: form.id,
  });
}

/** Once per form per day: a phishing form can hold hundreds of submissions. */
export function alertSubmissionHeld(env: AlertEnv, form: Pick<FormRow, "id" | "name" | "userId">, reasons: string[]) {
  const why = reasons.find((r) => r.startsWith("sensitive_field:"));
  notifyOpsLater(env, {
    kind: "submission_held",
    title: "Submission held for review",
    description: why
      ? `It asks for \`${plain(why.slice("sensitive_field:".length), 60)}\`, which phishing forms collect. Nothing was delivered.`
      : "The form is flagged, so nothing was delivered.",
    fields: [{ name: "Form", value: form.userId ? `${plain(form.name, 100)} (${form.id})` : form.id }],
    path: "/app/admin#ad-reports",
    dedupeKey: form.id,
  });
}

/** Once an hour: every notification from the shared sender fails until the key or domain is fixed. */
export function systemEmailFailingAlert(error: string) {
  return {
    kind: "system_email_failing" as const,
    title: "Resend rejected sendm8's own API key",
    description: "Notification, digest and verification emails from the shared sender are failing. Check RESEND_API_KEY and that the sending domain is still verified in Resend.",
    fields: [{ name: "Resend said", value: plain(error, 300) }],
    dedupeKey: "resend",
    dedupeWindow: "hour" as const,
  };
}
