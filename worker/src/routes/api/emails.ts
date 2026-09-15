import type { EmailAddressDto } from "@sendm8/shared";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, type SessionUser } from "../../app";
import { getLimits } from "../../config";
import { getDb, type Db } from "../../db/client";
import { emailAddresses } from "../../db/schema";
import { RESEND_COOLDOWN_MS, sendVerification, type VerificationResult } from "../../email/verification";
import { ApiError, notFound, readJson } from "../../lib/api-error";
import { newId } from "../../lib/ids";

export const emailRoutes = createRouter();

type AddressRow = typeof emailAddresses.$inferSelect;

const toDto = (row: AddressRow): EmailAddressDto => ({
  id: row.id,
  email: row.email,
  verified: row.verifiedAt !== null,
  verifiedAt: row.verifiedAt,
  verificationSentAt: row.tokenSentAt,
  createdAt: row.createdAt,
});

/** The address the user signed in with is already verified by GitHub/Google, so it costs no email. */
export async function ensureAccountAddress(db: Db, user: SessionUser) {
  if (!user.emailVerified) return;
  const now = Date.now();
  await db
    .insert(emailAddresses)
    .values({ id: newId(), userId: user.id, email: user.email.toLowerCase(), verifiedAt: now, createdAt: now })
    .onConflictDoNothing();
}

function verificationError(result: Exclude<VerificationResult, "sent">): ApiError {
  return result === "budget_exhausted"
    ? new ApiError(429, "email_budget_exhausted", "We've hit today's email limit. Try verifying again tomorrow.")
    : new ApiError(502, "email_send_failed", "We couldn't send the verification email. Try again shortly.");
}

async function loadOwnedAddress(db: Db, userId: string, id: string) {
  const row = await db
    .select()
    .from(emailAddresses)
    .where(and(eq(emailAddresses.id, id), eq(emailAddresses.userId, userId)))
    .get();
  if (!row) throw notFound("Email address");
  return row;
}

emailRoutes.get("/", async (c) => {
  const db = getDb(c.env);
  const user = c.get("user");
  await ensureAccountAddress(db, user);
  const rows = await db.select().from(emailAddresses).where(eq(emailAddresses.userId, user.id)).orderBy(asc(emailAddresses.createdAt)).all();
  return c.json({ data: rows.map(toDto) });
});

emailRoutes.post("/", async (c) => {
  const { email } = await readJson(c.req.raw, z.object({ email: z.email().max(254) }));
  const db = getDb(c.env);
  const user = c.get("user");
  const normalised = email.trim().toLowerCase();

  const [existing, total] = await db.batch([
    db
      .select()
      .from(emailAddresses)
      .where(and(eq(emailAddresses.userId, user.id), eq(emailAddresses.email, normalised))),
    db.select({ n: count() }).from(emailAddresses).where(eq(emailAddresses.userId, user.id)),
  ]);
  if (existing.length) throw new ApiError(409, "email_exists", "That address is already on your account.");
  if ((total[0]?.n ?? 0) >= getLimits(c.env).maxEmailAddressesPerUser) {
    throw new ApiError(409, "email_limit_reached", "You've reached the maximum number of email addresses.");
  }

  const now = Date.now();
  const address = await db.insert(emailAddresses).values({ id: newId(), userId: user.id, email: normalised, createdAt: now }).returning().get();

  // The signed-in address is verified by the OAuth provider already.
  if (user.emailVerified && normalised === user.email.toLowerCase()) {
    const verified = await db.update(emailAddresses).set({ verifiedAt: now }).where(eq(emailAddresses.id, address.id)).returning().get();
    return c.json({ data: toDto(verified) }, 201);
  }

  const result = await sendVerification(c.env, db, address, user.id, now);
  if (result !== "sent") {
    // Keep the address so they can resend later, but tell them it didn't go out.
    throw verificationError(result);
  }
  return c.json({ data: toDto(address) }, 201);
});

emailRoutes.post("/:id/resend", async (c) => {
  const db = getDb(c.env);
  const address = await loadOwnedAddress(db, c.get("user").id, c.req.param("id"));
  if (address.verifiedAt) throw new ApiError(409, "already_verified", "That address is already verified.");
  if (address.tokenSentAt && Date.now() - address.tokenSentAt < RESEND_COOLDOWN_MS) {
    throw new ApiError(429, "resend_cooldown", "We just sent one. Check your inbox (and spam folder) before trying again.");
  }
  const result = await sendVerification(c.env, db, address, address.userId);
  if (result !== "sent") throw verificationError(result);
  return c.json({ data: toDto(address) });
});

emailRoutes.delete("/:id", async (c) => {
  const db = getDb(c.env);
  const address = await loadOwnedAddress(db, c.get("user").id, c.req.param("id"));
  await db.delete(emailAddresses).where(eq(emailAddresses.id, address.id));
  return c.body(null, 204);
});
