import type { EmailSettingsDto } from "@sendm8/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter } from "../../app";
import { getLimits } from "../../config";
import { getDb } from "../../db/client";
import { userSettings } from "../../db/schema";
import { instantEmailsUsedToday } from "../../email/budget";
import { listResendDomains, validateResendKey } from "../../email/resend";
import { ApiError, readJson } from "../../lib/api-error";
import { decryptSecret, encryptSecret } from "../../lib/secrets";
import { isEmail } from "../../pipeline/deliver";

export const settingsRoutes = createRouter();

settingsRoutes.get("/email", async (c) => {
  const db = getDb(c.env);
  const userId = c.get("user").id;
  const limits = getLimits(c.env);
  const [settings, instantToday] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).get(),
    instantEmailsUsedToday(c.env.DB, userId, Date.now()),
  ]);

  const body: EmailSettingsDto = {
    byok: {
      configured: Boolean(settings?.resendKeyEnc),
      keyHint: settings?.resendKeyHint ?? null,
      from: settings?.resendFrom ?? null,
      healthy: Boolean(settings?.resendKeyEnc) && !settings?.resendKeyError,
      error: settings?.resendKeyError ?? null,
    },
    usage: { instantToday, instantLimit: limits.instantEmailsPerUserPerDay },
    digestHourUtc: limits.digestHourUtc,
  };
  return c.json({ data: body });
});

/** Accepts `you@domain.com` or `Your Name <you@domain.com>`. */
function parseFrom(value: string): { from: string; address: string } | null {
  const from = value.replace(/[\r\n]/g, "").trim();
  const match = from.match(/^(?:[^<>]{1,100}<([^<>]+)>|([^<>\s]+))$/);
  const address = (match?.[1] ?? match?.[2])?.trim();
  return isEmail(address) ? { from, address } : null;
}

const byokSchema = z.object({
  apiKey: z.string().trim().regex(/^re_[A-Za-z0-9_-]{8,200}$/, "must be a Resend API key (starts with re_)"),
  from: z.string().max(200),
});

settingsRoutes.put("/resend", async (c) => {
  const input = await readJson(c.req.raw, byokSchema);
  const parsed = parseFrom(input.from);
  if (!parsed) throw new ApiError(422, "validation_failed", 'from: use an address like "Your Name <hello@yourdomain.com>".');

  const validation = await validateResendKey(input.apiKey, parsed.address);
  if (!validation.ok) throw new ApiError(422, "resend_key_invalid", validation.error);

  const db = getDb(c.env);
  const userId = c.get("user").id;
  const values = {
    resendKeyEnc: await encryptSecret(c.env, input.apiKey),
    resendKeyHint: `re_••••${input.apiKey.slice(-4)}`,
    resendFrom: parsed.from,
    resendVerifiedAt: Date.now(),
    resendKeyError: null,
  };
  await db
    .insert(userSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userSettings.userId, set: values });

  return c.json({ data: { keyHint: values.resendKeyHint, from: values.resendFrom, restricted: validation.restricted } });
});

async function storedKey(env: Env, userId: string) {
  const settings = await getDb(env).select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (!settings?.resendKeyEnc) throw new ApiError(404, "resend_not_configured", "Add a Resend API key first.");
  return { settings, apiKey: await decryptSecret(env, settings.resendKeyEnc) };
}

/** Changes the sender address using the stored key, without re-entering it. */
settingsRoutes.patch("/resend", async (c) => {
  const input = await readJson(c.req.raw, z.object({ from: z.string().max(200) }));
  const parsed = parseFrom(input.from);
  if (!parsed) throw new ApiError(422, "validation_failed", 'from: use an address like "Your Name <hello@yourdomain.com>".');

  const userId = c.get("user").id;
  const { apiKey } = await storedKey(c.env, userId);
  const validation = await validateResendKey(apiKey, parsed.address);
  if (!validation.ok) throw new ApiError(422, "resend_key_invalid", validation.error);

  await getDb(c.env)
    .update(userSettings)
    .set({ resendFrom: parsed.from, resendVerifiedAt: Date.now(), resendKeyError: null })
    .where(eq(userSettings.userId, userId));
  return c.json({ data: { from: parsed.from, restricted: validation.restricted } });
});

/** Verified sending domains for the stored key, for the "from" picker. */
settingsRoutes.get("/resend/domains", async (c) => {
  const { apiKey } = await storedKey(c.env, c.get("user").id);
  const list = await listResendDomains(apiKey);
  if (!list.ok) throw new ApiError(502, "resend_unavailable", list.error);
  return c.json({ data: { restricted: list.restricted, domains: list.domains.filter((d) => d.status === "verified").map((d) => d.name) } });
});

settingsRoutes.delete("/resend", async (c) => {
  const db = getDb(c.env);
  await db
    .update(userSettings)
    .set({ resendKeyEnc: null, resendKeyHint: null, resendFrom: null, resendVerifiedAt: null, resendKeyError: null })
    .where(eq(userSettings.userId, c.get("user").id));
  return c.body(null, 204);
});
