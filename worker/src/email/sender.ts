import { emailFrom } from "../lib/app-url";
import { decryptSecret } from "../lib/secrets";
import { notifyOps } from "../ops/alerts";
import { systemEmailFailingAlert } from "../ops/events";
import { sendWithResend, type EmailMessage, type SendResult } from "./resend";

export type OutgoingEmail = Omit<EmailMessage, "from">;

type SystemSenderEnv = Pick<Env, "RESEND_API_KEY" | "EMAIL_FROM" | "APP_URL"> & Partial<Pick<Env, "DB" | "ALERT_WEBHOOK_URL" | "LIMITS_JSON">>;

/**
 * Sends from the sendm8 system address. Without RESEND_API_KEY (local dev), emails are logged instead.
 * If Resend rejects the key or sending domain, the operator is alerted (at most hourly).
 */
export async function sendSystemEmail(env: SystemSenderEnv, message: OutgoingEmail): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${message.to.join(",")} subject="${message.subject}"\n${message.text}`);
    return { ok: true, id: "dev-logged" };
  }
  const result = await sendWithResend(env.RESEND_API_KEY, { ...message, from: emailFrom(env) });
  if (!result.ok && result.keyRejected && env.DB) {
    await notifyOps({ DB: env.DB, ALERT_WEBHOOK_URL: env.ALERT_WEBHOOK_URL, APP_URL: env.APP_URL, LIMITS_JSON: env.LIMITS_JSON ?? "" }, systemEmailFailingAlert(result.error));
  }
  return result;
}

export interface ByokSettings {
  resendKeyEnc: string | null;
  resendFrom: string | null;
  resendKeyError: string | null;
}

/** The user's own Resend key is usable when present and not known to be rejected. */
export const byokUsable = (settings: ByokSettings | undefined | null): settings is ByokSettings & { resendKeyEnc: string; resendFrom: string } =>
  Boolean(settings?.resendKeyEnc && settings.resendFrom && !settings.resendKeyError);

export async function sendByokEmail(env: Pick<Env, "ENCRYPTION_KEY">, settings: ByokSettings & { resendKeyEnc: string; resendFrom: string }, message: OutgoingEmail) {
  const apiKey = await decryptSecret(env, settings.resendKeyEnc);
  return sendWithResend(apiKey, { ...message, from: settings.resendFrom });
}
