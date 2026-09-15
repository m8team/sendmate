import type { AdminReportDto, AdminUsageDto, BlocklistEntryDto } from "@sendm8/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createRouter, requireAdmin } from "../../app";
import { getDb } from "../../db/client";
import { abuseReports, blocklist, forms, session, submissions, user } from "../../db/schema";
import { ApiError, notFound, readJson } from "../../lib/api-error";
import { hashIp } from "../../lib/crypto";
import { computeUsage } from "../../lib/usage";

export const adminRoutes = createRouter();

adminRoutes.use("*", requireAdmin);

// ── Reports ────────────────────────────────────────────────────────────────

adminRoutes.get("/reports", async (c) => {
  const openOnly = c.req.query("status") !== "all";
  const rows = await getDb(c.env)
    .select({ report: abuseReports, form: forms, ownerEmail: user.email })
    .from(abuseReports)
    .leftJoin(forms, eq(forms.id, abuseReports.formId))
    .leftJoin(user, eq(user.id, forms.userId))
    .where(openOnly ? isNull(abuseReports.resolvedAt) : undefined)
    .orderBy(desc(abuseReports.createdAt))
    .limit(100)
    .all();

  const data: AdminReportDto[] = rows.map(({ report, form, ownerEmail }) => ({
    id: report.id,
    reason: report.reason,
    details: report.details,
    reporterEmail: report.reporterEmail,
    createdAt: report.createdAt,
    resolvedAt: report.resolvedAt,
    form: form ? { id: form.id, name: form.name, status: form.status, flaggedReason: form.flaggedReason, ownerEmail: ownerEmail ?? form.ownerEmail } : null,
  }));
  return c.json({ data });
});

adminRoutes.post("/reports/:id/resolve", async (c) => {
  const updated = await getDb(c.env)
    .update(abuseReports)
    .set({ resolvedAt: Date.now() })
    .where(eq(abuseReports.id, c.req.param("id")))
    .returning({ id: abuseReports.id })
    .get();
  if (!updated) throw notFound("Report");
  return c.json({ data: { ok: true } });
});

// ── Forms ──────────────────────────────────────────────────────────────────

const reasonSchema = z.object({ reason: z.string().trim().min(1).max(200) });

adminRoutes.post("/forms/:id/disable", async (c) => {
  const { reason } = await readJson(c.req.raw, reasonSchema);
  const updated = await getDb(c.env)
    .update(forms)
    .set({ status: "disabled", flaggedReason: reason })
    .where(eq(forms.id, c.req.param("id")))
    .returning({ id: forms.id })
    .get();
  if (!updated) throw notFound("Form");
  return c.json({ data: { ok: true } });
});

/**
 * Clears a flag after review: the form goes back to active, it's marked reviewed (so the
 * sensitive-field hold no longer applies), held submissions are released to the inbox,
 * and open reports are resolved. Released submissions aren't re-notified.
 */
adminRoutes.post("/forms/:id/restore", async (c) => {
  const db = getDb(c.env);
  const formId = c.req.param("id");
  const now = Date.now();
  const form = await db.select().from(forms).where(eq(forms.id, formId)).get();
  if (!form) throw notFound("Form");

  await db.batch([
    db
      .update(forms)
      .set({ status: form.status === "disabled" ? "active" : form.status, flaggedReason: null, reviewedAt: now })
      .where(eq(forms.id, formId)),
    db
      .update(submissions)
      .set({ status: "ok" })
      .where(and(eq(submissions.formId, formId), eq(submissions.status, "held"))),
    db
      .update(abuseReports)
      .set({ resolvedAt: now })
      .where(and(eq(abuseReports.formId, formId), isNull(abuseReports.resolvedAt))),
  ]);
  return c.json({ data: { ok: true } });
});

// ── Users ──────────────────────────────────────────────────────────────────

adminRoutes.post("/users/:id/suspend", async (c) => {
  const { reason } = await readJson(c.req.raw, reasonSchema);
  const db = getDb(c.env);
  const userId = c.req.param("id");
  if (userId === c.get("user").id) throw new ApiError(422, "cannot_suspend_self", "You can't suspend yourself.");
  const target = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).get();
  if (!target) throw notFound("User");

  await db.batch([
    db.insert(blocklist).values({ type: "user", value: userId, reason, createdAt: Date.now() }).onConflictDoUpdate({
      target: [blocklist.type, blocklist.value],
      set: { reason },
    }),
    db
      .update(forms)
      .set({ status: "disabled", flaggedReason: `suspended: ${reason}` })
      .where(eq(forms.userId, userId)),
    db.delete(session).where(eq(session.userId, userId)),
  ]);
  return c.json({ data: { ok: true } });
});

/** Lifts the suspension. Forms stay disabled until restored individually. */
adminRoutes.post("/users/:id/unsuspend", async (c) => {
  await getDb(c.env)
    .delete(blocklist)
    .where(and(eq(blocklist.type, "user"), eq(blocklist.value, c.req.param("id"))));
  return c.json({ data: { ok: true } });
});

// ── Blocklist ──────────────────────────────────────────────────────────────

adminRoutes.get("/blocklist", async (c) => {
  const rows = await getDb(c.env).select().from(blocklist).orderBy(desc(blocklist.createdAt)).limit(500).all();
  const data: BlocklistEntryDto[] = rows.map((r) => ({ type: r.type as BlocklistEntryDto["type"], value: r.value, reason: r.reason, createdAt: r.createdAt }));
  return c.json({ data });
});

const entrySchema = z.object({
  // "ip" takes a raw address and stores only its hash.
  type: z.enum(["ip", "ip_hash", "email", "email_domain"]),
  value: z.string().trim().toLowerCase().min(1).max(254),
  reason: z.string().trim().max(200).optional(),
});

adminRoutes.post("/blocklist", async (c) => {
  const input = await readJson(c.req.raw, entrySchema);
  const type = input.type === "ip" ? "ip_hash" : input.type;
  const value = input.type === "ip" ? (await hashIp(c.env.IP_HASH_SECRET, input.value))! : input.value.replace(/^@/, "");
  await getDb(c.env)
    .insert(blocklist)
    .values({ type, value, reason: input.reason ?? null, createdAt: Date.now() })
    .onConflictDoUpdate({ target: [blocklist.type, blocklist.value], set: { reason: input.reason ?? null } });
  return c.json({ data: { type, value } }, 201);
});

adminRoutes.delete("/blocklist", async (c) => {
  const input = await readJson(c.req.raw, z.object({ type: z.enum(["ip_hash", "email", "email_domain", "user"]), value: z.string().min(1).max(254) }));
  await getDb(c.env)
    .delete(blocklist)
    .where(and(eq(blocklist.type, input.type), eq(blocklist.value, input.value)));
  return c.body(null, 204);
});

// ── Usage (free-tier headroom) ────────────────────────────────────────────

adminRoutes.get("/usage", async (c) => {
  const data: AdminUsageDto = await computeUsage(c.env);
  return c.json({ data });
});
