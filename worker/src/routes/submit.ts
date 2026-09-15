import type { Context } from "hono";
import { and, eq, gte, or, sql } from "drizzle-orm";
import type { SubmissionMeta, SubmissionStatus, SubmitFailure, SubmitSuccess } from "@sendm8/shared";
import { createRouter, type AppEnv } from "../app";
import { getLimits } from "../config";
import { getDb, type BatchItem, type BatchList, type FormRow } from "../db/client";
import { blocklist, forms, submissions, usageDaily } from "../db/schema";
import { deleteSubmissionFiles, storeUploads, type StoreResult } from "../files/storage";
import { LOAD_SHED_SCOPE } from "../lib/usage";
import { hashIp } from "../lib/crypto";
import { clientIp, escapeHtml, hostAllowed, parseHttpUrl, requestHost, wantsJson } from "../lib/http";
import { newId } from "../lib/ids";
import { decryptSecret } from "../lib/secrets";
import { dayKey, monthStartKey } from "../lib/time";
import { turnstileEnabled, verifyTurnstile } from "../lib/turnstile";
import { captureError } from "../ops/errors";
import { alertFormCreated, alertSubmissionHeld } from "../ops/events";
import { renderPage, stamp } from "../pages/layout";
import { isEmail } from "../pipeline/deliver";
import { SubmitError } from "../pipeline/errors";
import { parseSubmission, type ParsedSubmission } from "../pipeline/parse";
import { assessSpam, SUSPICIOUS_SCORE } from "../pipeline/spam";
import { claimZeroSignupSlot, dispatchStored, newZeroSignupForm, zeroSignupInserts } from "../pipeline/zero-signup";

export const submitRoutes = createRouter();

type Ctx = Context<AppEnv>;

function corsHeaders(c: Ctx, form?: Pick<FormRow, "allowedOrigins"> | null): Record<string, string> {
  const origin = c.req.header("origin");
  const headers: Record<string, string> = { vary: "Origin" };
  if (!origin) return headers;
  const host = parseHttpUrl(origin)?.hostname;
  const restricted = form && form.allowedOrigins.length > 0;
  if (!restricted || (host && hostAllowed(host, form.allowedOrigins))) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

submitRoutes.options("/:formId", (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(c),
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Accept, X-Requested-With",
      "access-control-max-age": "86400",
    },
  });
});

submitRoutes.get("/:formId", (c) => {
  const endpoint = `${c.env.APP_URL}/f/${c.req.param("formId")}`;
  return renderPage({
    title: "sendm8 form endpoint",
    heading: "This is a form endpoint.",
    body: `${stamp("POST only")}
<p>Point your form here and submissions will be delivered:</p>
<p><code>&lt;form action="${escapeHtml(endpoint)}" method="POST"&gt;</code></p>`,
  });
});

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The submitter's email, from `_replyto` or an `email` field, for blocklist checks. */
function submitterEmail(parsed: ParsedSubmission): string | null {
  const candidate = parsed.special._replyto ?? parsed.fields.email;
  return typeof candidate === "string" && isEmail(candidate.trim()) ? candidate.trim().toLowerCase() : null;
}

function needsChallenge(env: Env, form: FormRow, json: boolean, status: SubmissionStatus, score: number): boolean {
  // AJAX callers can't follow a redirect to a challenge page; they should use their own Turnstile widget.
  if (json || status !== "ok" || form.turnstileSecretEnc || !turnstileEnabled(env)) return false;
  const mode = form.settings.challenge ?? "suspicious";
  return mode === "always" || (mode === "suspicious" && score >= SUSPICIOUS_SCORE);
}

submitRoutes.post("/:formId", async (c) => {
  const json = wantsJson(c.req.raw);
  let form: FormRow | undefined;

  try {
    const env = c.env;
    const limits = getLimits(env);
    const now = Date.now();
    const endpoint = safeDecode(c.req.param("formId")).trim().toLowerCase();
    const zeroSignupEmail = endpoint.includes("@") ? endpoint : null;
    if (zeroSignupEmail && !isEmail(zeroSignupEmail)) {
      throw new SubmitError(404, "form_not_found", "That isn't a valid email endpoint. Use /f/you@example.com or a form ID.");
    }

    const db = getDb(env);
    const ip = clientIp(c.req.raw);
    const ipHash = await hashIp(env.IP_HASH_SECRET, ip);

    const [ipBurst, formBurst] = await Promise.all([
      env.RL_SUBMIT_IP?.limit({ key: `${endpoint}:${ipHash ?? "unknown"}` }),
      env.RL_SUBMIT_FORM?.limit({ key: endpoint }),
    ]);
    if (ipBurst?.success === false || formBurst?.success === false) {
      throw new SubmitError(429, "rate_limited", "Whoa, slow down. Too many submissions, try again in a minute.");
    }

    const parsed = await parseSubmission(c.req.raw, limits, { uploads: Boolean(env.FILES) });
    const email = submitterEmail(parsed);

    // Email endpoints resolve to their form, or a new unclaimed one that's only created if a submission is stored.
    let formId = endpoint;
    let newZeroSignup: FormRow | undefined;
    if (zeroSignupEmail) {
      const existing = await db.select().from(forms).where(eq(forms.ownerEmail, zeroSignupEmail)).get();
      newZeroSignup = existing ? undefined : newZeroSignupForm(zeroSignupEmail, now);
      formId = existing?.id ?? newZeroSignup!.id;
    }

    // One round trip: the form, this month's usage, any blocklist hit for this IP or email, and load shedding.
    const [formRows, usageRows, blockedRows, shedRows] = await db.batch([
      db.select().from(forms).where(eq(forms.id, formId)).limit(1),
      db
        .select({ total: sql<number>`coalesce(sum(${usageDaily.submissions}), 0)` })
        .from(usageDaily)
        .where(and(eq(usageDaily.scope, "form"), eq(usageDaily.scopeId, formId), gte(usageDaily.day, monthStartKey(now)))),
      db
        .select({ type: blocklist.type })
        .from(blocklist)
        .where(
          or(
            and(eq(blocklist.type, "ip_hash"), eq(blocklist.value, ipHash ?? "")),
            and(eq(blocklist.type, "email"), eq(blocklist.value, email ?? "")),
            and(eq(blocklist.type, "email_domain"), eq(blocklist.value, email?.split("@")[1] ?? "")),
          ),
        )
        .limit(1),
      db
        .select({ level: usageDaily.emails })
        .from(usageDaily)
        .where(and(eq(usageDaily.scope, LOAD_SHED_SCOPE), eq(usageDaily.scopeId, "all"), eq(usageDaily.day, dayKey(now)))),
    ]);
    // Set hourly by the cron when today's D1 writes near the free-tier limit.
    const shedding = (shedRows[0]?.level ?? 0) > 0;

    form = formRows[0] ?? newZeroSignup;
    if (!form) throw new SubmitError(404, "form_not_found", "This form doesn't exist. Check the form's action URL.");
    if (form.status === "disabled") throw new SubmitError(410, "form_disabled", "This form has been disabled.");
    if (form.status === "paused") throw new SubmitError(423, "form_paused", "This form isn't accepting submissions right now.");

    const submittingHost = requestHost(c.req.raw);
    const strictOrigin = form.settings.strictOrigin ?? true;
    if (form.allowedOrigins.length > 0) {
      const allowed = submittingHost ? hostAllowed(submittingHost, form.allowedOrigins) : !strictOrigin;
      if (!allowed) throw new SubmitError(403, "origin_not_allowed", "This form doesn't accept submissions from this website.");
    }

    if (blockedRows.length > 0) throw new SubmitError(403, "blocked", "This submission has been blocked.");

    const monthlyLimit = form.userId ? limits.submissionsPerFormPerMonth : limits.submissionsPerUnclaimedFormPerMonth;
    if ((usageRows[0]?.total ?? 0) >= monthlyLimit) {
      throw new SubmitError(429, "quota_exceeded", "This form has reached its monthly submission limit.");
    }

    if (form.turnstileSecretEnc) {
      const result = await verifyTurnstile(await decryptSecret(env, form.turnstileSecretEnc), parsed.special["cf-turnstile-response"], { remoteIp: ip });
      if (!result.success) {
        if (result.unavailable) throw new SubmitError(503, "captcha_unavailable", "We couldn't check the captcha just now. Please try again.");
        throw new SubmitError(403, "captcha_failed", "Please complete the captcha and try again.");
      }
    }

    const verdict = assessSpam(parsed, form.settings, { reviewed: form.reviewedAt !== null });
    let status = verdict.status;
    const reasons = [...verdict.reasons];
    if (status === "ok" && form.flaggedReason) {
      status = "held";
      reasons.push("form_flagged");
    }

    const id = newId();
    const next = resolveRedirect(parsed.special._next ?? parsed.special._redirect, form, submittingHost);
    const challenge = needsChallenge(env, form, json, status, verdict.score);
    if (challenge) status = "pending_challenge";

    // Under load, spam isn't worth a D1 write.
    const store = !verdict.drop && !(shedding && status === "spam");

    if (store) {
      if (newZeroSignup && (shedding || !(await claimZeroSignupSlot(env, ipHash, now)))) {
        throw new SubmitError(429, "too_many_new_forms", "Too many new form endpoints right now. Try again tomorrow.");
      }

      // Files are only kept for submissions that might be delivered; spam and held ones don't get storage.
      const droppedFiles = [...parsed.droppedFiles];
      let uploads: StoreResult = { files: [], dropped: [] };
      if (parsed.files.length) {
        if (status === "spam" || status === "held") droppedFiles.push(...parsed.files.map((f) => f.field));
        else uploads = await storeUploads(env, form, id, parsed.files);
        droppedFiles.push(...uploads.dropped);
      }
      const fileMeta = uploads.files.length ? { files: uploads.files, storageScope: uploads.scope } : {};

      try {
        // A new zero-signup form is inserted first, in the same batch, so the submission's foreign key holds.
        await db.batch([
          ...(newZeroSignup ? await zeroSignupInserts(db, newZeroSignup) : []),
          db.insert(submissions).values({
            id,
            formId,
            data: parsed.fields,
            meta: {
              ipHash,
              country: (c.req.raw.cf?.country as string | undefined) ?? null,
              userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null,
              referrer: c.req.header("referer")?.slice(0, 500) ?? null,
              special: pickSpecial(parsed.special),
              spamReasons: reasons,
              ...(droppedFiles.length ? { droppedFiles } : {}),
              ...fileMeta,
              ...(challenge && next ? { next } : {}),
            },
            spamScore: verdict.score,
            status,
            createdAt: now,
          }),
          db
            .insert(usageDaily)
            .values({ scope: "form", scopeId: formId, day: dayKey(now), submissions: 1 })
            .onConflictDoUpdate({
              target: [usageDaily.scope, usageDaily.scopeId, usageDaily.day],
              set: { submissions: sql`${usageDaily.submissions} + 1` },
            }),
        ] as BatchItem[] as BatchList);
      } catch (error) {
        // Don't leave orphaned files (or reserved bytes) behind if the row never made it.
        if (uploads.files.length) await deleteSubmissionFiles(env, [{ meta: fileMeta as SubmissionMeta }]);
        throw error;
      }

      if (status === "ok") {
        c.executionCtx.waitUntil(dispatchStored(env, form, id, c.req.header("referer") ?? null).catch((error) => captureError(env, error, { where: "dispatch", formId, submissionId: id })));
      }
      if (newZeroSignup) alertFormCreated(env, newZeroSignup, { ownerEmail: newZeroSignup.ownerEmail, endpoint: "email", site: submittingHost });
      if (status === "held") alertSubmissionHeld(env, form, reasons);
    }

    if (challenge) return c.redirect(new URL(`/c/${id}`, env.APP_URL).toString(), 303);
    return success(c, form, id, next);
  } catch (error) {
    if (error instanceof SubmitError) return failure(c, json, form, error);
    c.executionCtx.waitUntil(captureError(c.env, error, { where: "submit", formId: form?.id }));
    return failure(c, json, form, new SubmitError(500, "internal_error", "Something went wrong on our end. Please try again."));
  }
});

/** Special fields worth keeping for delivery (subject line, reply-to, cc). Captcha tokens are dropped. */
function pickSpecial(special: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const key of ["_subject", "_replyto", "_cc"]) {
    const value = special[key];
    if (value) kept[key] = value.slice(0, 500);
  }
  return kept;
}

/**
 * `_next` may only point at an allowed origin, or (when unrestricted) back to the site that
 * submitted, so sendm8 can't be abused as an open redirect. The owner-configured URL is trusted.
 */
function resolveRedirect(next: string | undefined, form: FormRow, submittingHost: string | null): string | undefined {
  const url = parseHttpUrl(next);
  if (url) {
    const host = url.hostname.toLowerCase();
    const ok = form.allowedOrigins.length > 0 ? hostAllowed(host, form.allowedOrigins) : host === submittingHost;
    if (ok) return url.toString();
  }
  return parseHttpUrl(form.redirectUrl)?.toString();
}

export function thanksUrl(appUrl: string, referer: string | undefined): string {
  const thanks = new URL("/thanks", appUrl);
  const back = parseHttpUrl(referer);
  if (back) thanks.searchParams.set("back", back.toString());
  return thanks.toString();
}

function success(c: Ctx, form: FormRow, id: string, next: string | undefined): Response {
  if (wantsJson(c.req.raw)) {
    const body: SubmitSuccess = { ok: true, id, ...(next ? { next } : {}) };
    return c.json(body, 200, corsHeaders(c, form));
  }
  return c.redirect(next ?? thanksUrl(c.env.APP_URL, c.req.header("referer")), 303);
}

function failure(c: Ctx, json: boolean, form: FormRow | undefined, error: SubmitError): Response {
  if (json) {
    const body: SubmitFailure = { ok: false, error: { code: error.code, message: error.message } };
    return new Response(JSON.stringify(body), {
      status: error.status,
      headers: { "content-type": "application/json", ...corsHeaders(c, form) },
    });
  }
  const back = parseHttpUrl(c.req.header("referer"));
  return renderPage({
    status: error.status,
    title: "Submission not sent",
    heading: error.status === 429 ? "Hold up a sec." : "That didn't go through.",
    body: `${stamp("Return to sender")}
<p>${escapeHtml(error.message)}</p>
${back ? `<p><a href="${escapeHtml(back.toString())}">← Go back</a></p>` : ""}`,
  });
}
