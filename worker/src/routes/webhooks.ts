import { getDb } from "../db/client";
import { createRouter } from "../app";
import { suppress } from "../email/suppression";
import { verifyWebhookSignature } from "../lib/webhook-signature";
import { captureError } from "../ops/errors";
import { alertEmailSuppressed } from "../ops/events";

export const webhookRoutes = createRouter();

const MAX_BODY_BYTES = 100_000;

interface ResendEvent {
  type?: string;
  data?: { to?: unknown; bounce?: { type?: string; subType?: string; message?: string } };
}

/**
 * Resend's delivery webhook (https://resend.com/docs/dashboard/webhooks/introduction). A hard bounce or a
 * spam complaint means the address is unusable or unwelcome, so we record it and stop sending. Soft
 * bounces (a full mailbox, a server hiccup) are ignored: those can recover. Off until
 * RESEND_WEBHOOK_SECRET is set, and nothing is trusted without a valid signature.
 */
webhookRoutes.post("/resend", async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: { code: "not_found", message: "No such endpoint." } }, 404);

  const body = await c.req.text();
  if (body.length > MAX_BODY_BYTES) return c.json({ error: { code: "payload_too_large", message: "Too large." } }, 413);
  const valid = await verifyWebhookSignature(
    secret,
    { id: c.req.header("svix-id") ?? null, timestamp: c.req.header("svix-timestamp") ?? null, signature: c.req.header("svix-signature") ?? null },
    body,
  );
  if (!valid) return c.json({ error: { code: "invalid_signature", message: "Bad signature." } }, 401);

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return c.json({ error: { code: "invalid_json", message: "Not JSON." } }, 400);
  }

  const hard = event.type === "email.bounced" && event.data?.bounce?.type?.toLowerCase() === "permanent";
  const complaint = event.type === "email.complained";
  if (!hard && !complaint) return c.json({ ok: true, ignored: event.type ?? "unknown" });

  const recipients = (Array.isArray(event.data?.to) ? event.data.to : []).filter((a): a is string => typeof a === "string" && a.includes("@"));
  const reason = complaint ? "complaint" : "bounce";
  const detail = complaint ? "spam complaint" : [event.data?.bounce?.subType, event.data?.bounce?.message].filter(Boolean).join(": ") || "hard bounce";
  const db = getDb(c.env);
  try {
    for (const address of recipients) {
      if (await suppress(db, address, reason, detail)) alertEmailSuppressed(c.env, address, reason, detail);
    }
  } catch (error) {
    // Resend retries on a non-2xx, so a database hiccup isn't lost.
    c.executionCtx.waitUntil(captureError(c.env, error, { where: "resend webhook" }));
    return c.json({ error: { code: "internal_error", message: "Try again." } }, 500);
  }
  return c.json({ ok: true, suppressed: recipients.length });
});
