import { eq } from "drizzle-orm";
import { getLimits } from "../config";
import type { Db } from "../db/client";
import { emailAddresses } from "../db/schema";
import { sha256Hex } from "../lib/crypto";
import { randomToken } from "../lib/secrets";
import { urls } from "../lib/urls";
import { claimSystemEmail } from "./budget";
import { sendSystemEmail } from "./sender";
import { verificationEmail } from "./templates";

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

export type VerificationResult = "sent" | "budget_exhausted" | "send_failed";

export async function sendVerification(env: Env, db: Db, address: { id: string; email: string }, userId: string | null, now = Date.now()): Promise<VerificationResult> {
  if (!(await claimSystemEmail(env.DB, getLimits(env), "account", userId, now))) return "budget_exhausted";

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await db.update(emailAddresses).set({ tokenHash, tokenSentAt: now }).where(eq(emailAddresses.id, address.id));

  const result = await sendSystemEmail(env, {
    to: [address.email],
    ...verificationEmail({ email: address.email, verifyUrl: urls.verifyEmail(env.APP_URL, token) }),
    idempotencyKey: `verify:${tokenHash}`,
  });
  return result.ok ? "sent" : "send_failed";
}

/** The address a live (unexpired) token belongs to, without using the token up. */
export async function findByToken(db: Db, token: string, now = Date.now()) {
  const tokenHash = await sha256Hex(token);
  const address = await db.select().from(emailAddresses).where(eq(emailAddresses.tokenHash, tokenHash)).get();
  if (!address || !address.tokenSentAt || now - address.tokenSentAt > VERIFICATION_TTL_MS) return null;
  return address;
}

/**
 * Verifies a dashboard address. Returns null if the token is unknown or expired, or belongs to a
 * zero-signup confirmation (those go through /confirm so their forms get activated too).
 */
export async function consumeVerificationToken(db: Db, token: string, now = Date.now()) {
  const address = await findByToken(db, token, now);
  if (!address || address.userId === null) return null;
  await db
    .update(emailAddresses)
    .set({ verifiedAt: address.verifiedAt ?? now, tokenHash: null, tokenSentAt: null })
    .where(eq(emailAddresses.id, address.id));
  return address;
}
