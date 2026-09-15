import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { createRouter } from "../../app";
import { getDb, type Db } from "../../db/client";
import { forms, submissions } from "../../db/schema";
import { deleteSubmissionFiles, fileResponse } from "../../files/storage";
import { deliverSubmission } from "../../pipeline/deliver";
import { deliverMany } from "../../pipeline/deliver-many";
import { ApiError, notFound, readJson } from "../../lib/api-error";
import { toSubmissionDto } from "../../lib/dto";
import { loadOwnedForm } from "./forms";
import { captureError } from "../../ops/errors";

export const submissionRoutes = createRouter();

async function loadOwnedSubmission(db: Db, userId: string, submissionId: string) {
  const row = await db
    .select({ submission: submissions })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(and(eq(submissions.id, submissionId), eq(forms.userId, userId)))
    .get();
  if (!row) throw notFound("Submission");
  return row.submission;
}

submissionRoutes.get("/submissions/:id", async (c) => {
  const row = await loadOwnedSubmission(getDb(c.env), c.get("user").id, c.req.param("id"));
  return c.json({ data: toSubmissionDto(row) });
});

/** Downloads an uploaded file for the submission's owner. Held submissions keep their files hidden. */
submissionRoutes.get("/submissions/:id/files/:fileId", async (c) => {
  const row = await loadOwnedSubmission(getDb(c.env), c.get("user").id, c.req.param("id"));
  if (row.status === "held") throw new ApiError(403, "held_for_review", "This submission is held for review.");
  const file = row.meta.files?.find((f) => f.id === c.req.param("fileId"));
  const object = file && (await c.env.FILES?.get(file.key));
  if (!file || !object) throw notFound("File");
  return fileResponse(object, file);
});

const updateSchema = z
  .object({
    starred: z.boolean().optional(),
    // Owners can only move between inbox and spam; "held" is released by marking it ok.
    status: z.enum(["ok", "spam"]).optional(),
  })
  .strict();

submissionRoutes.patch("/submissions/:id", async (c) => {
  const input = await readJson(c.req.raw, updateSchema);
  const db = getDb(c.env);
  const row = await loadOwnedSubmission(db, c.get("user").id, c.req.param("id"));
  if (input.status !== undefined && row.status === "held") {
    throw new ApiError(403, "held_for_review", "This submission is held for review and can't be released from here.");
  }
  const updated = await db
    .update(submissions)
    .set({
      ...(input.starred !== undefined && { starred: input.starred }),
      ...(input.status !== undefined && { status: input.status }),
    })
    .where(eq(submissions.id, row.id))
    .returning()
    .get();

  // Rescued from spam: deliver it now, as it would have been.
  if (input.status === "ok" && row.status !== "ok" && row.deliveries.length === 0) {
    c.executionCtx.waitUntil(deliverSubmission(c.env, updated.id).catch((error) => captureError(c.env, error, { where: "rescue delivery", submissionId: updated.id })));
  }
  return c.json({ data: toSubmissionDto(updated) });
});

/**
 * Retries failed (and permanently skipped) deliveries right away, e.g. after fixing a webhook or
 * verifying an address. Attempts reset so the channel gets a fresh set of automatic retries.
 */
submissionRoutes.post("/submissions/:id/retry", async (c) => {
  const db = getDb(c.env);
  const userId = c.get("user").id;
  const row = await loadOwnedSubmission(db, userId, c.req.param("id"));
  if (row.status !== "ok") throw new ApiError(422, "not_deliverable", "Only inbox submissions can be delivered.");

  const retryable = row.deliveries.filter((d) => d.status === "failed" || d.status === "skipped");
  if (retryable.length === 0) throw new ApiError(409, "nothing_to_retry", "Every delivery for this submission already went through.");
  const limited = await c.env.RL_CHANNEL_ACTIONS?.limit({ key: userId });
  if (limited?.success === false) throw new ApiError(429, "rate_limited", "Slow down a little. Try again in a minute.");

  await db
    .update(submissions)
    .set({ deliveries: row.deliveries.filter((d) => !retryable.includes(d)), retryAt: null })
    .where(eq(submissions.id, row.id));
  await deliverSubmission(c.env, row.id);
  return c.json({ data: toSubmissionDto(await loadOwnedSubmission(db, userId, row.id)) });
});

submissionRoutes.delete("/submissions/:id", async (c) => {
  const db = getDb(c.env);
  const row = await loadOwnedSubmission(db, c.get("user").id, c.req.param("id"));
  await db.delete(submissions).where(eq(submissions.id, row.id));
  await deleteSubmissionFiles(c.env, [row]);
  return c.body(null, 204);
});

const bulkSchema = z.object({
  ids: z.array(z.string().max(40)).min(1).max(100),
  action: z.enum(["delete", "spam", "not_spam", "star", "unstar"]),
});

submissionRoutes.post("/forms/:formId/submissions/bulk", async (c) => {
  const input = await readJson(c.req.raw, bulkSchema);
  const db = getDb(c.env);
  const form = await loadOwnedForm(db, c.get("user").id, c.req.param("formId"));
  const target = and(
    eq(submissions.formId, form.id),
    inArray(submissions.id, input.ids),
    // Held submissions can be deleted or starred, but only an admin can change their status.
    input.action === "spam" || input.action === "not_spam" ? ne(submissions.status, "held") : undefined,
  );

  if (input.action === "delete") {
    const deleted = await db.delete(submissions).where(target).returning({ id: submissions.id, meta: submissions.meta });
    await deleteSubmissionFiles(c.env, deleted);
    return c.json({ data: { affected: deleted.length } });
  }

  const result = await db
    .update(submissions)
    .set(input.action === "spam" ? { status: "spam" } : input.action === "not_spam" ? { status: "ok" } : { starred: input.action === "star" })
    .where(target)
    .returning({ id: submissions.id, deliveries: submissions.deliveries });

  if (input.action === "not_spam") {
    // Deliver rescued submissions that never went out. What doesn't fit this request's query budget is
    // queued for the retry cron, so nothing is dropped.
    const rescued = result.filter((r) => r.deliveries.length === 0).map((r) => r.id);
    c.executionCtx.waitUntil(deliverMany(c.env, rescued, { alreadyUsed: 10 }).catch((error) => captureError(c.env, error, { where: "bulk rescue delivery" })));
  }
  return c.json({ data: { affected: result.length } });
});
