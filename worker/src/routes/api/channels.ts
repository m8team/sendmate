import type { ChannelDto, CreatedChannelDto } from "@sendm8/shared";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter } from "../../app";
import { drivers, toNotification } from "../../channels";
import { discord } from "../../channels/discord";
import { slack } from "../../channels/slack";
import { telegram } from "../../channels/telegram";
import { newWebhookSecret, webhook, type WebhookConfig } from "../../channels/webhook";
import { getLimits } from "../../config";
import { getDb, type Db, type SubmissionRow } from "../../db/client";
import { channels, emailAddresses, forms, userSettings } from "../../db/schema";
import { claimSystemEmail } from "../../email/budget";
import { byokUsable, sendByokEmail, sendSystemEmail } from "../../email/sender";
import { ApiError, notFound, readJson } from "../../lib/api-error";
import { newId } from "../../lib/ids";
import { decryptJson, encryptJson } from "../../lib/secrets";
import { buildNotification, flagByokKey, type ChannelRow, type EmailChannelConfig } from "../../pipeline/deliver";
import { ensureAccountAddress } from "./emails";
import { loadOwnedForm } from "./forms";

export const channelRoutes = createRouter();

type AddressRow = typeof emailAddresses.$inferSelect;

async function toDto(env: Env, channel: ChannelRow, addresses: AddressRow[]): Promise<ChannelDto> {
  const dto: ChannelDto = {
    id: channel.id,
    formId: channel.formId,
    type: channel.type,
    label: channel.label,
    enabled: channel.enabled,
    createdAt: channel.createdAt,
    lastTest: channel.lastTest ?? null,
  };
  if (channel.type === "email") {
    const { emailAddressId } = await decryptJson<EmailChannelConfig>(env, channel.configEnc);
    dto.recipientVerified = Boolean(addresses.find((a) => a.id === emailAddressId)?.verifiedAt);
  }
  return dto;
}

async function loadOwnedChannel(db: Db, userId: string, channelId: string) {
  const row = await db
    .select({ channel: channels, form: forms })
    .from(channels)
    .innerJoin(forms, eq(forms.id, channels.formId))
    .where(and(eq(channels.id, channelId), eq(forms.userId, userId)))
    .get();
  if (!row) throw notFound("Channel");
  return row;
}

const userAddresses = (db: Db, userId: string) => db.select().from(emailAddresses).where(eq(emailAddresses.userId, userId)).all();

/** Creating and testing channels makes outbound requests, so both are rate limited per user. */
async function limitChannelActions(env: Env, userId: string) {
  const outcome = await env.RL_CHANNEL_ACTIONS?.limit({ key: userId });
  if (outcome?.success === false) throw new ApiError(429, "rate_limited", "Slow down a little. Try again in a minute.");
}

channelRoutes.get("/forms/:formId/channels", async (c) => {
  const db = getDb(c.env);
  const userId = c.get("user").id;
  const form = await loadOwnedForm(db, userId, c.req.param("formId"));
  const [rows, addresses] = await Promise.all([
    db.select().from(channels).where(eq(channels.formId, form.id)).orderBy(asc(channels.createdAt)).all(),
    userAddresses(db, userId),
  ]);
  return c.json({ data: await Promise.all(rows.map((row) => toDto(c.env, row, addresses))) });
});

const emailSchema = z.object({ type: z.literal("email"), emailAddressId: z.string().min(1).max(40) });
const createSchema = z.discriminatedUnion("type", [emailSchema, discord.inputSchema, slack.inputSchema, telegram.inputSchema, webhook.inputSchema]);

const labelSchema = z.object({ label: z.string().trim().min(1).max(60).optional() });

channelRoutes.post("/forms/:formId/channels", async (c) => {
  const [input, { label: customLabel }] = await Promise.all([readJson(c.req.raw.clone(), createSchema), readJson(c.req.raw, labelSchema)]);
  const db = getDb(c.env);
  const user = c.get("user");
  const form = await loadOwnedForm(db, user.id, c.req.param("formId"));

  const existing = await db.select().from(channels).where(eq(channels.formId, form.id)).all();
  if (existing.length >= getLimits(c.env).maxChannelsPerForm) {
    throw new ApiError(409, "channel_limit_reached", "This form has the maximum number of notification channels.");
  }
  const sameType = await Promise.all(existing.filter((ch) => ch.type === input.type).map((ch) => decryptJson<unknown>(c.env, ch.configEnc)));

  let config: unknown;
  let label: string;
  let secret: string | undefined;

  if (input.type === "email") {
    await ensureAccountAddress(db, user);
    const address = (await userAddresses(db, user.id)).find((a) => a.id === input.emailAddressId);
    if (!address) throw new ApiError(422, "validation_failed", "emailAddressId: add and verify this address first.");
    if (sameType.some((cfg) => (cfg as EmailChannelConfig).emailAddressId === address.id)) {
      throw new ApiError(409, "channel_exists", "This form already notifies that address.");
    }
    config = { emailAddressId: address.id } satisfies EmailChannelConfig;
    label = address.email;
  } else {
    await limitChannelActions(c.env, user.id);
    const driver = drivers[input.type];
    const prepared = await driver.prepare(input, { env: c.env });
    if (!prepared.ok) throw new ApiError(422, "channel_invalid", prepared.error);
    if (sameType.some((cfg) => driver.sameDestination(cfg, prepared.config))) {
      throw new ApiError(409, "channel_exists", "This form already sends to that destination.");
    }
    config = prepared.config;
    label = prepared.label;
    secret = prepared.secret;
  }

  const channel = await db
    .insert(channels)
    .values({ id: newId(), formId: form.id, type: input.type, configEnc: await encryptJson(c.env, config), label: customLabel ?? label, createdAt: Date.now() })
    .returning()
    .get();

  const body: CreatedChannelDto = { ...(await toDto(c.env, channel, await userAddresses(db, user.id))), ...(secret && { secret }) };
  return c.json({ data: body }, 201);
});

channelRoutes.patch("/channels/:id", async (c) => {
  const input = await readJson(
    c.req.raw,
    z
      .object({ enabled: z.boolean().optional(), label: z.string().trim().min(1).max(60).optional() })
      .strict()
      .refine((v) => v.enabled !== undefined || v.label !== undefined, "Send enabled and/or label."),
  );
  const db = getDb(c.env);
  const userId = c.get("user").id;
  const { channel } = await loadOwnedChannel(db, userId, c.req.param("id"));
  const updated = await db
    .update(channels)
    .set({ ...(input.enabled !== undefined && { enabled: input.enabled }), ...(input.label !== undefined && { label: input.label }) })
    .where(eq(channels.id, channel.id))
    .returning()
    .get();
  return c.json({ data: await toDto(c.env, updated, await userAddresses(db, userId)) });
});

channelRoutes.delete("/channels/:id", async (c) => {
  const db = getDb(c.env);
  const { channel } = await loadOwnedChannel(db, c.get("user").id, c.req.param("id"));
  await db.delete(channels).where(eq(channels.id, channel.id));
  return c.body(null, 204);
});

/** Issues a new signing secret for a webhook channel. The old one stops working immediately. */
channelRoutes.post("/channels/:id/rotate-secret", async (c) => {
  const db = getDb(c.env);
  const userId = c.get("user").id;
  const { channel } = await loadOwnedChannel(db, userId, c.req.param("id"));
  if (channel.type !== "webhook") throw new ApiError(422, "unsupported", "Only webhook channels have a signing secret.");

  const config = await decryptJson<WebhookConfig>(c.env, channel.configEnc);
  const secret = newWebhookSecret();
  const updated = await db
    .update(channels)
    .set({ configEnc: await encryptJson(c.env, { ...config, secret } satisfies WebhookConfig) })
    .where(eq(channels.id, channel.id))
    .returning()
    .get();
  const body: CreatedChannelDto = { ...(await toDto(c.env, updated, [])), secret };
  return c.json({ data: body });
});

function sampleSubmission(now: number, email: string): Pick<SubmissionRow, "id" | "data" | "meta" | "createdAt"> {
  return {
    id: `test-${now}`,
    data: { name: "Test Mate", email, message: "G'day! This is a test submission from sendm8." },
    meta: { ipHash: null, country: null, userAgent: null, referrer: null, special: {}, spamReasons: [] },
    createdAt: now,
  };
}

/** Sends a sample notification through the channel. Email tests count against the instant budget. */
channelRoutes.post("/channels/:id/test", async (c) => {
  const db = getDb(c.env);
  const user = c.get("user");
  const { channel, form } = await loadOwnedChannel(db, user.id, c.req.param("id"));
  const now = Date.now();
  await limitChannelActions(c.env, user.id);

  const recordTest = (ok: boolean, message: string) =>
    db.update(channels).set({ lastTest: { at: now, ok, message: message.slice(0, 300) } }).where(eq(channels.id, channel.id));

  if (channel.type !== "email") {
    const driver = drivers[channel.type];
    const config = await decryptJson(c.env, channel.configEnc);
    const result = await driver.send(config, toNotification(c.env, form, sampleSubmission(now, user.email), true), { env: c.env });
    await recordTest(result.ok, result.ok ? "Delivered" : result.error);
    if (!result.ok) throw new ApiError(502, "test_failed", `The test didn't go through: ${result.error}`);
    return c.json({ data: { ok: true } });
  }

  const [addresses, settings] = await Promise.all([userAddresses(db, user.id), db.select().from(userSettings).where(eq(userSettings.userId, user.id)).get()]);
  const { emailAddressId } = await decryptJson<EmailChannelConfig>(c.env, channel.configEnc);
  const recipient = addresses.find((a) => a.id === emailAddressId);
  if (!recipient?.verifiedAt) throw new ApiError(422, "recipient_unverified", "Verify this email address before sending a test.");

  const message = { ...buildNotification(c.env, form, sampleSubmission(now, recipient.email), true), to: [recipient.email] };

  let result;
  if (byokUsable(settings)) {
    result = await sendByokEmail(c.env, settings, message);
    if (!result.ok && result.keyRejected) await flagByokKey(db, user.id, result.error);
  } else {
    if (!(await claimSystemEmail(c.env.DB, getLimits(c.env), "instant", user.id, now))) {
      throw new ApiError(429, "instant_limit_reached", "You've used today's instant emails. Add your own Resend key to go unlimited.");
    }
    result = await sendSystemEmail(c.env, message);
  }

  await recordTest(result.ok, result.ok ? "Delivered" : result.error);
  if (!result.ok) throw new ApiError(502, "test_failed", `The test email didn't send: ${result.error}`);
  return c.json({ data: { ok: true } });
});
