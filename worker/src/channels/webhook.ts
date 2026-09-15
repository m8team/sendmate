import type { WebhookPayload } from "@sendm8/shared";
import { z } from "zod";
import { hmacHex } from "../lib/crypto";
import { randomToken } from "../lib/secrets";
import { checkOutboundUrl } from "../lib/ssrf";
import { postJson, truncate } from "./http";
import type { ChannelDriver, Notification } from "./types";

export interface WebhookConfig {
  url: string;
  secret: string;
}

const inputSchema = z.object({
  type: z.literal("webhook"),
  url: z.string().trim().max(2000),
});

export const newWebhookSecret = () => `whsec_${randomToken(24)}`;

export function webhookPayload(n: Notification): WebhookPayload {
  return {
    event: n.isTest ? "test" : "submission.created",
    form: { id: n.formId, name: n.formName },
    submission: {
      id: n.submissionId,
      createdAt: new Date(n.createdAt).toISOString(),
      data: n.data,
      subject: n.subject,
      replyTo: n.replyTo,
      referrer: n.referrer,
      country: n.country,
      files: n.files,
    },
  };
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`, Stripe-style so replayed requests can be rejected. */
export async function signWebhook(secret: string, body: string, timestamp: number): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

const ownHost = (env: Env) => new URL(env.APP_URL).hostname;

export const webhook: ChannelDriver<typeof inputSchema, WebhookConfig> = {
  inputSchema,

  async prepare(input, { env }) {
    const check = checkOutboundUrl(input.url, ownHost(env));
    if (!check.ok) return { ok: false, error: `url: ${check.reason}` };
    const secret = newWebhookSecret();
    // Query strings often carry tokens, so the label only shows host + path.
    const label = truncate(`${check.url.hostname}${check.url.pathname === "/" ? "" : check.url.pathname}`, 60);
    return { ok: true, config: { url: check.url.toString(), secret }, label, secret };
  },

  async send(config, notification, { env }) {
    // Re-check at send time in case the guard rules have tightened since the channel was created.
    const check = checkOutboundUrl(config.url, ownHost(env));
    if (!check.ok) return { ok: false, error: `blocked: ${check.reason}`, retryable: false };

    const body = JSON.stringify(webhookPayload(notification));
    const signature = await signWebhook(config.secret, body, Math.floor(Date.now() / 1000));
    return postJson(config.url, body, {
      headers: {
        "x-sendm8-event": notification.isTest ? "test" : "submission.created",
        "x-sendm8-delivery": notification.submissionId,
        "x-sendm8-signature": signature,
      },
    });
  },

  sameDestination: (a, b) => a.url === b.url,
};
