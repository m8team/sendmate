import { emailFrom } from "../lib/app-url";
import { decryptSecret } from "../lib/secrets";
import { sendWithResend, type EmailMessage, type SendResult } from "./resend";

export type OutgoingEmail = Omit<EmailMessage, "from">;

/** Sends from the sendm8 system address. Without RESEND_API_KEY (local dev), emails are logged instead. */
export async function sendSystemEmail(env: Pick<Env, "RESEND_API_KEY" | "EMAIL_FROM" | "APP_URL">, message: OutgoingEmail): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${message.to.join(",")} subject="${message.subject}"\n${message.text}`);
    return { ok: true, id: "dev-logged" };
  }
  return sendWithResend(env.RESEND_API_KEY, { ...message, from: emailFrom(env) });
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
