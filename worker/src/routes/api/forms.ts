import { and, count, desc, eq, gte, inArray, like, lt, max, or, sql, type SQL } from "drizzle-orm";
import { decodeTime } from "ulidx";
import { z } from "zod";
import type { DailyStat, FolderCounts, FormDto, FormSettings, Page, SubmissionDto, SubmissionFilter } from "@sendm8/shared";
import { createRouter } from "../../app";
import { getLimits } from "../../config";
import { getDb, type Db, type FormRow } from "../../db/client";
import { forms, submissions, usageDaily } from "../../db/schema";
import { ApiError, notFound, readJson } from "../../lib/api-error";
import { deleteSubmissionFiles, submissionsWithFiles } from "../../files/storage";
import { submissionsToCsv } from "../../lib/csv";
import { toFormDto, toSubmissionDto } from "../../lib/dto";
import { newFormId } from "../../lib/ids";
import { encryptSecret } from "../../lib/secrets";
import { checkTurnstileSecret } from "../../lib/turnstile";
import { dayKey, monthStartKey } from "../../lib/time";
import { alertFormCreated } from "../../ops/events";

export const formRoutes = createRouter();

// ── Validation ─────────────────────────────────────────────────────────────

/** Accepts `example.com`, `*.example.com` or a pasted URL, and stores the bare hostname. */
const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^[a-z]+:\/\//, "").replace(/[/:?#].*$/, ""))
  .pipe(z.string().regex(/^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+$/, "must be a hostname like example.com"));

const settingsSchema = z
  .object({
    honeypotField: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_-]{0,99}$/, "must start with a letter and contain only letters, numbers, - and _")
      .nullable()
      .optional(),
    notifyMode: z.enum(["instant", "digest", "off"]).optional(),
    strictOrigin: z.boolean().optional(),
    challenge: z.enum(["off", "suspicious", "always"]).optional(),
    aiSpamScoring: z.boolean().optional(),
  })
  .strict();

/** Merges a settings patch; `null` values remove the setting. */
function mergeSettings(current: FormSettings, patch: FormSettings): FormSettings {
  const merged: Record<string, unknown> = { ...current, ...patch };
  for (const [key, value] of Object.entries(merged)) if (value === null) delete merged[key];
  return merged as FormSettings;
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  allowedOrigins: z.array(hostname).max(10).optional(),
  redirectUrl: z.url({ protocol: /^https?$/ }).max(2000).nullable().optional(),
  settings: settingsSchema.optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(["active", "paused"]).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────

export async function loadOwnedForm(db: Db, userId: string, formId: string): Promise<FormRow> {
  const form = await db
    .select()
    .from(forms)
    .where(and(eq(forms.id, formId), eq(forms.userId, userId)))
    .get();
  if (!form) throw notFound("Form");
  return form;
}

async function formStats(db: Db, formIds: string[], now: number) {
  if (formIds.length === 0) return { usage: new Map<string, number>(), last: new Map<string, number>() };
  const [usageRows, lastRows] = await db.batch([
    db
      .select({ formId: usageDaily.scopeId, total: sql<number>`sum(${usageDaily.submissions})` })
      .from(usageDaily)
      .where(and(eq(usageDaily.scope, "form"), inArray(usageDaily.scopeId, formIds), gte(usageDaily.day, monthStartKey(now))))
      .groupBy(usageDaily.scopeId),
    // max(id) is an index-only lookup; the ULID encodes the timestamp.
    db
      .select({ formId: submissions.formId, lastId: max(submissions.id) })
      .from(submissions)
      .where(inArray(submissions.formId, formIds))
      .groupBy(submissions.formId),
  ]);
  return {
    usage: new Map(usageRows.map((r) => [r.formId, Number(r.total)])),
    last: new Map(lastRows.filter((r) => r.lastId).map((r) => [r.formId, decodeTime(r.lastId!.toUpperCase())])),
  };
}

// ── Forms ──────────────────────────────────────────────────────────────────

formRoutes.get("/", async (c) => {
  const db = getDb(c.env);
  const limits = getLimits(c.env);
  const rows = await db.select().from(forms).where(eq(forms.userId, c.get("user").id)).orderBy(desc(forms.createdAt)).all();
  const stats = await formStats(
    db,
    rows.map((f) => f.id),
    Date.now(),
  );
  const data: FormDto[] = rows.map((form) =>
    toFormDto(form, c.env.APP_URL, {
      submissionsThisMonth: stats.usage.get(form.id) ?? 0,
      monthlyLimit: limits.submissionsPerFormPerMonth,
      lastSubmissionAt: stats.last.get(form.id) ?? null,
    }),
  );
  return c.json({ data });
});

formRoutes.post("/", async (c) => {
  const input = await readJson(c.req.raw, createSchema);
  const db = getDb(c.env);
  const limits = getLimits(c.env);
  const userId = c.get("user").id;

  const existing = await db.select({ n: count() }).from(forms).where(eq(forms.userId, userId)).get();
  if ((existing?.n ?? 0) >= limits.maxFormsPerUser) {
    throw new ApiError(409, "form_limit_reached", `You can have up to ${limits.maxFormsPerUser} forms.`);
  }

  const form = await db
    .insert(forms)
    .values({
      id: newFormId(),
      userId,
      name: input.name,
      allowedOrigins: input.allowedOrigins ?? [],
      redirectUrl: input.redirectUrl ?? null,
      settings: mergeSettings({}, input.settings ?? {}),
      createdAt: Date.now(),
    })
    .returning()
    .get();
  alertFormCreated(c.env, form, { ownerEmail: c.get("user").email, endpoint: "dashboard" });

  return c.json(
    { data: toFormDto(form, c.env.APP_URL, { submissionsThisMonth: 0, monthlyLimit: limits.submissionsPerFormPerMonth, lastSubmissionAt: null }) },
    201,
  );
});

async function folderCounts(db: Db, formId: string): Promise<FolderCounts> {
  const row = await db
    .select({
      inbox: sql<number>`coalesce(sum(${submissions.status} = 'ok'), 0)`,
      spam: sql<number>`coalesce(sum(${submissions.status} = 'spam'), 0)`,
      held: sql<number>`coalesce(sum(${submissions.status} = 'held'), 0)`,
      starred: sql<number>`coalesce(sum(${submissions.starred}), 0)`,
      total: count(),
    })
    .from(submissions)
    .where(eq(submissions.formId, formId))
    .get();
  return { inbox: Number(row?.inbox ?? 0), spam: Number(row?.spam ?? 0), held: Number(row?.held ?? 0), starred: Number(row?.starred ?? 0), total: row?.total ?? 0 };
}

formRoutes.get("/:formId", async (c) => {
  const db = getDb(c.env);
  const form = await loadOwnedForm(db, c.get("user").id, c.req.param("formId"));
  const [stats, counts] = await Promise.all([formStats(db, [form.id], Date.now()), folderCounts(db, form.id)]);
  return c.json({
    data: {
      ...toFormDto(form, c.env.APP_URL, {
        submissionsThisMonth: stats.usage.get(form.id) ?? 0,
        monthlyLimit: getLimits(c.env).submissionsPerFormPerMonth,
        lastSubmissionAt: stats.last.get(form.id) ?? null,
      }),
      counts,
    },
  });
});

formRoutes.patch("/:formId", async (c) => {
  const input = await readJson(c.req.raw, updateSchema);
  const db = getDb(c.env);
  const form = await loadOwnedForm(db, c.get("user").id, c.req.param("formId"));

  if (input.status && (form.status === "disabled" || form.status === "pending_confirmation")) {
    throw new ApiError(403, "status_locked", "This form's status can't be changed.");
  }

  const changes = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.allowedOrigins !== undefined && { allowedOrigins: input.allowedOrigins }),
    ...(input.redirectUrl !== undefined && { redirectUrl: input.redirectUrl }),
    ...(input.settings !== undefined && { settings: mergeSettings(form.settings, input.settings) }),
  };
  const updated = Object.keys(changes).length ? await db.update(forms).set(changes).where(eq(forms.id, form.id)).returning().get() : form;

  const stats = await formStats(db, [form.id], Date.now());
  return c.json({
    data: toFormDto(updated, c.env.APP_URL, {
      submissionsThisMonth: stats.usage.get(form.id) ?? 0,
      monthlyLimit: getLimits(c.env).submissionsPerFormPerMonth,
      lastSubmissionAt: stats.last.get(form.id) ?? null,
    }),
  });
});

/**
 * Stores the form's own Turnstile secret. From then on every submission must carry a valid
 * `cf-turnstile-response`, which suits AJAX forms that can't use the sendm8 challenge page.
 */
formRoutes.put("/:formId/turnstile", async (c) => {
  const { secretKey } = await readJson(c.req.raw, z.object({ secretKey: z.string().trim().min(20).max(200) }));
  const db = getDb(c.env);
  const form = await loadOwnedForm(db, c.get("user").id, c.req.param("formId"));

  const check = await checkTurnstileSecret(secretKey);
  if (check === "invalid") throw new ApiError(422, "turnstile_secret_invalid", "Cloudflare didn't accept that Turnstile secret key.");
  if (check === "unavailable") throw new ApiError(502, "turnstile_unavailable", "Couldn't reach Cloudflare to check the key. Try again shortly.");

  await db
    .update(forms)
    .set({ turnstileSecretEnc: await encryptSecret(c.env, secretKey) })
    .where(eq(forms.id, form.id));
  return c.json({ data: { turnstileConfigured: true } });
});

formRoutes.delete("/:formId/turnstile", async (c) => {
  const db = getDb(c.env);
  const form = await loadOwnedForm(db, c.get("user").id, c.req.param("formId"));
  await db.update(forms).set({ turnstileSecretEnc: null }).where(eq(forms.id, form.id));
  return c.body(null, 204);
});

formRoutes.delete("/:formId", async (c) => {
  const db = getDb(c.env);
  const form = await loadOwnedForm(db, c.get("user").id, c.req.param("formId"));
  const withFiles = await submissionsWithFiles(db, [form.id]);
  await db.delete(forms).where(eq(forms.id, form.id));
  await deleteSubmissionFiles(c.env, withFiles);
  return c.body(null, 204);
});

// ── Submissions (per form) ─────────────────────────────────────────────────

const listQuery = z.object({
  filter: z.enum(["inbox", "spam", "held", "starred", "all"]).default("inbox"),
  cursor: z.string().max(40).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function filterCondition(filter: SubmissionFilter): SQL | undefined {
  switch (filter) {
    case "inbox":
      return eq(submissions.status, "ok");
    case "spam":
      return eq(submissions.status, "spam");
    case "held":
      return eq(submissions.status, "held");
    case "starred":
      return eq(submissions.starred, true);
    case "all":
      return undefined;
  }
}

/**
 * Tracking numbers in the dashboard ("SM8 7Q2K 9F4X 3M") are the last 10 characters of the
 * submission id, uppercased. Returns the id fragment to match, or null if q doesn't look like one.
 */
export function idFragment(q: string): string | null {
  const compact = q.toLowerCase().replace(/[\s-]/g, "").replace(/^sm8/, "");
  return /^[0-9a-z]{6,26}$/.test(compact) && /\d/.test(compact) ? compact : null;
}

function searchConditions(formId: string, opts: { filter: SubmissionFilter; q?: string }) {
  const conditions = [eq(submissions.formId, formId), filterCondition(opts.filter)];
  if (opts.q) {
    const pattern = `%${opts.q.replace(/[\\%_]/g, "\\$&")}%`;
    const matchesData = sql`${submissions.data} LIKE ${pattern} ESCAPE '\\'`;
    const fragment = idFragment(opts.q);
    conditions.push(fragment ? or(matchesData, like(submissions.id, `%${fragment}`)) : matchesData);
  }
  return conditions;
}

async function querySubmissions(db: Db, formId: string, opts: { filter: SubmissionFilter; cursor?: string; q?: string; limit: number }) {
  const conditions = searchConditions(formId, opts);
  if (opts.cursor) conditions.push(lt(submissions.id, opts.cursor));

  const rows = await db
    .select()
    .from(submissions)
    .where(and(...conditions))
    .orderBy(desc(submissions.id))
    .limit(opts.limit + 1)
    .all();

  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  return { data: page.map(toSubmissionDto), nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
}

formRoutes.get("/:formId/submissions", async (c) => {
  const query = listQuery.safeParse(c.req.query());
  if (!query.success) throw new ApiError(422, "validation_failed", query.error.issues[0]?.message ?? "Invalid query.");
  const db = getDb(c.env);
  const form = await loadOwnedForm(db, c.get("user").id, c.req.param("formId"));
  const result: Page<SubmissionDto> = await querySubmissions(db, form.id, query.data);
  return c.json(result);
});

const exportQuery = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  filter: z.enum(["inbox", "spam", "held", "starred", "all"]).default("inbox"),
  cursor: z.string().max(40).optional(),
  q: z.string().trim().max(200).optional(),
});

/** Every field name across the export, in order of first appearance, so all CSV pages share columns. */
async function exportColumns(db: Db, formId: string, opts: { filter: SubmissionFilter; q?: string }): Promise<string[]> {
  const rows = await db
    .select({ key: sql<string>`je.key` })
    .from(sql`${submissions}, json_each(${submissions.data}) AS je`)
    .where(and(...searchConditions(formId, opts)))
    .groupBy(sql`je.key`)
    .orderBy(sql`min(${submissions.id})`, sql`je.key`)
    .all();
  return rows.map((r) => r.key);
}

/**
 * Exports up to 1,000 submissions per request to stay inside the free-tier CPU budget.
 * Follow `X-Next-Cursor` for the next page; the dashboard stitches pages together.
 */
formRoutes.get("/:formId/export", async (c) => {
  const query = exportQuery.safeParse(c.req.query());
  if (!query.success) throw new ApiError(422, "validation_failed", query.error.issues[0]?.message ?? "Invalid query.");
  const db = getDb(c.env);
  const form = await loadOwnedForm(db, c.get("user").id, c.req.param("formId"));
  const page = await querySubmissions(db, form.id, { ...query.data, limit: 1000 });

  const headers: Record<string, string> = {};
  if (page.nextCursor) headers["x-next-cursor"] = page.nextCursor;

  if (query.data.format === "json") {
    return c.json(page, 200, headers);
  }
  const filename = `${form.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "form"}-${dayKey(Date.now())}.csv`;
  const columns = await exportColumns(db, form.id, query.data);
  return c.body(submissionsToCsv(page.data, !query.data.cursor, columns), 200, {
    ...headers,
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${filename}"`,
  });
});

formRoutes.get("/:formId/stats", async (c) => {
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 30) || 30, 1), 90);
  const db = getDb(c.env);
  const form = await loadOwnedForm(db, c.get("user").id, c.req.param("formId"));
  const now = Date.now();
  const since = dayKey(now - (days - 1) * 86_400_000);

  const rows = await db
    .select({ day: usageDaily.day, submissions: usageDaily.submissions })
    .from(usageDaily)
    .where(and(eq(usageDaily.scope, "form"), eq(usageDaily.scopeId, form.id), gte(usageDaily.day, since)))
    .all();
  const byDay = new Map(rows.map((r) => [r.day, r.submissions]));

  const data: DailyStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(now - i * 86_400_000);
    data.push({ day, submissions: byDay.get(day) ?? 0 });
  }
  return c.json({ data });
});
