import type { AdminGrowthDto, AdminReportDto, AdminUsageDto, BlocklistEntryDto, ErrorGroupDto } from "@sendm8/shared";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { createRouter, requireAdmin } from "../../app";
import { getDb } from "../../db/client";
import { abuseReports, blocklist, errorGroups, forms, session, submissions, user } from "../../db/schema";
import { ApiError, notFound, readJson } from "../../lib/api-error";
import { hashIp } from "../../lib/crypto";
import { isLocalHost, parseHttpUrl } from "../../lib/http";
import { computeUsage } from "../../lib/usage";
import { toErrorGroupDto } from "../../ops/errors";

export const adminRoutes = createRouter();

adminRoutes.use("*", requireAdmin);

// ── Growth ─────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

/**
 * Sign-ups, and whether their forms get real traffic. A form is "live" when it receives a submission
 * from a public website (not a local dev server, not sendm8 itself) from someone other than its owner.
 */
adminRoutes.get("/growth", async (c) => {
  const now = Date.now();
  const week = now - 7 * DAY;
  const month = now - 30 * DAY;
  const appHost = new URL(c.env.APP_URL).hostname;

  const [counts, sources, recent] = (await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT (SELECT count(*) FROM user) AS users, (SELECT count(*) FROM user WHERE created_at >= ?1) AS usersLast7d,
              (SELECT count(*) FROM forms) AS forms, (SELECT count(*) FROM forms WHERE created_at >= ?1) AS formsLast7d`,
    ).bind(week),
    c.env.DB.prepare(`SELECT heard_from AS source, count(*) AS count FROM user_settings WHERE heard_from IS NOT NULL GROUP BY heard_from ORDER BY count DESC`),
    c.env.DB.prepare(
      `SELECT s.form_id AS formId, s.created_at AS createdAt, json_extract(s.meta, '$.referrer') AS referrer,
              lower(coalesce(json_extract(s.data, '$.email'), json_extract(s.meta, '$.special._replyto'))) AS email,
              lower(coalesce(u.email, f.owner_email)) AS owner
       FROM submissions s JOIN forms f ON f.id = s.form_id LEFT JOIN user u ON u.id = f.user_id
       WHERE s.status = 'ok' AND s.created_at >= ?1
       ORDER BY s.created_at DESC LIMIT 5000`,
    ).bind(month),
  ])) as [D1Result, D1Result, D1Result];

  type Row = { formId: string; createdAt: number; referrer: string | null; email: string | null; owner: string | null };
  const live = (recent.results as Row[]).flatMap((row) => {
    const host = parseHttpUrl(row.referrer)?.hostname.toLowerCase();
    if (!host || isLocalHost(host) || host === appHost || (row.email && row.email === row.owner)) return [];
    return [{ ...row, host }];
  });

  const sites = new Map<string, { forms: Set<string>; submissions: number }>();
  for (const row of live) {
    const site = sites.get(row.host) ?? { forms: new Set(), submissions: 0 };
    site.forms.add(row.formId);
    site.submissions++;
    sites.set(row.host, site);
  }

  const total = counts.results[0] as { users: number; usersLast7d: number; forms: number; formsLast7d: number };
  const data: AdminGrowthDto = {
    ...total,
    liveForms30d: new Set(live.map((r) => r.formId)).size,
    liveForms7d: new Set(live.filter((r) => r.createdAt >= week).map((r) => r.formId)).size,
    sources: sources.results as AdminGrowthDto["sources"],
    topSites: [...sites]
      .map(([host, s]) => ({ host, forms: s.forms.size, submissions: s.submissions }))
      .sort((a, b) => b.submissions - a.submissions)
      .slice(0, 10),
  };
  return c.json({ data });
});

// ── Errors ─────────────────────────────────────────────────────────────────

adminRoutes.get("/errors", async (c) => {
  const status = c.req.query("status");
  const where = status === "all" ? undefined : status === "resolved" ? isNotNull(errorGroups.resolvedAt) : isNull(errorGroups.resolvedAt);
  const rows = await getDb(c.env).select().from(errorGroups).where(where).orderBy(desc(errorGroups.lastSeenAt)).limit(100).all();
  const data: ErrorGroupDto[] = rows.map(toErrorGroupDto);
  return c.json({ data });
});

for (const [action, resolvedAt] of [
  ["resolve", () => Date.now()],
  ["reopen", () => null],
] as const) {
  adminRoutes.post(`/errors/:id/${action}`, async (c) => {
    const updated = await getDb(c.env)
      .update(errorGroups)
      .set({ resolvedAt: resolvedAt() })
      .where(eq(errorGroups.id, c.req.param("id")))
      .returning({ id: errorGroups.id })
      .get();
    if (!updated) throw notFound("Error");
    return c.json({ ok: true });
  });
}

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
