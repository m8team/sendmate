import type { Limits, StoredFile, SubmissionMeta } from "@sendm8/shared";
import { getLimits } from "../config";
import { inArray, sql } from "drizzle-orm";
import type { Db, FormRow, SubmissionRow } from "../db/client";
import { submissions } from "../db/schema";
import { hmacHex } from "../lib/crypto";
import { newId } from "../lib/ids";

export interface IncomingFile {
  field: string;
  file: File;
}

/** Storage counter scope for a form's owner. Unclaimed zero-signup forms are capped per form. */
export const ownerScope = (form: Pick<FormRow, "id" | "userId">) => (form.userId ? `user:${form.userId}` : `form:${form.id}`);

function scopeLimit(scope: string, limits: Limits) {
  return scope.startsWith("user:") ? limits.storagePerUserBytes : limits.storagePerUnclaimedFormBytes;
}

function splitScope(scope: string): [string, string] {
  const index = scope.indexOf(":");
  return [scope.slice(0, index), scope.slice(index + 1)];
}

/** Atomically adds `bytes` to a counter only if it stays within `limit`. */
async function claimBytes(db: D1Database, scope: string, scopeId: string, bytes: number, limit: number): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO storage_usage (scope, scope_id, bytes) SELECT ?1, ?2, ?3 WHERE ?3 <= ?4
       ON CONFLICT (scope, scope_id) DO UPDATE SET bytes = bytes + excluded.bytes WHERE storage_usage.bytes + excluded.bytes <= ?4
       RETURNING bytes`,
    )
    .bind(scope, scopeId, bytes, limit)
    .first();
  return row !== null;
}

async function releaseBytes(db: D1Database, scope: string, scopeId: string, bytes: number) {
  await db
    .prepare("UPDATE storage_usage SET bytes = max(bytes - ?3, 0) WHERE scope = ?1 AND scope_id = ?2")
    .bind(scope, scopeId, bytes)
    .run();
}

export type StoreResult = { files: StoredFile[]; dropped: string[]; scope?: string };

/**
 * Reserves storage (platform-wide, then per owner) and writes files to R2 under
 * `f/<formId>/<submissionId>/<fileId>`. Over-limit or failed uploads are dropped, not fatal:
 * the submission is still stored and the owner can see which files didn't make it.
 */
export async function storeUploads(env: Env, form: Pick<FormRow, "id" | "userId">, submissionId: string, incoming: IncomingFile[]): Promise<StoreResult> {
  const bucket = env.FILES;
  if (!bucket || incoming.length === 0) return { files: [], dropped: incoming.map((f) => f.field) };

  const limits = getLimits(env);
  const scope = ownerScope(form);
  const [scopeName, scopeId] = splitScope(scope);
  const total = incoming.reduce((sum, f) => sum + f.file.size, 0);

  if (!(await claimBytes(env.DB, "global", "all", total, limits.storageTotalBytes))) {
    return { files: [], dropped: incoming.map((f) => f.field) };
  }
  if (!(await claimBytes(env.DB, scopeName, scopeId, total, scopeLimit(scope, limits)))) {
    await releaseBytes(env.DB, "global", "all", total);
    return { files: [], dropped: incoming.map((f) => f.field) };
  }

  const files: StoredFile[] = [];
  const dropped: string[] = [];
  let failedBytes = 0;
  for (const { field, file } of incoming) {
    const id = newId();
    const key = `f/${form.id}/${submissionId}/${id}`;
    const name = (file.name || "upload").replace(/[\r\n"\\/]/g, "_").slice(0, 200);
    const type = (file.type || "application/octet-stream").slice(0, 100);
    try {
      await bucket.put(key, file.stream(), {
        httpMetadata: { contentType: type },
        customMetadata: { name, field },
      });
      files.push({ id, field, name, size: file.size, type, key });
    } catch (error) {
      console.error("file upload failed", key, error);
      dropped.push(field);
      failedBytes += file.size;
    }
  }
  if (failedBytes > 0) {
    await Promise.all([releaseBytes(env.DB, "global", "all", failedBytes), releaseBytes(env.DB, scopeName, scopeId, failedBytes)]);
  }
  return { files, dropped, scope };
}

/** Deletes stored files for submissions that are being (or have been) deleted, and releases their bytes. */
export async function deleteSubmissionFiles(env: Env, rows: { meta: SubmissionMeta }[]) {
  const withFiles = rows.filter((r) => r.meta.files?.length && r.meta.storageScope);
  if (!env.FILES || withFiles.length === 0) return;

  const keys = withFiles.flatMap((r) => r.meta.files!.map((f) => f.key));
  for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));

  const byScope = new Map<string, number>();
  let total = 0;
  for (const row of withFiles) {
    const bytes = row.meta.files!.reduce((sum, f) => sum + f.size, 0);
    byScope.set(row.meta.storageScope!, (byScope.get(row.meta.storageScope!) ?? 0) + bytes);
    total += bytes;
  }
  await Promise.all([
    releaseBytes(env.DB, "global", "all", total),
    ...[...byScope].map(([scope, bytes]) => {
      const [name, id] = splitScope(scope);
      return releaseBytes(env.DB, name, id, bytes);
    }),
  ]);
}

/** Submissions (with their meta) that have stored files, for forms about to be deleted. */
export function submissionsWithFiles(db: Db, formIds: string[]) {
  if (formIds.length === 0) return Promise.resolve([]);
  return db
    .select({ meta: submissions.meta })
    .from(submissions)
    .where(sql`${inArray(submissions.formId, formIds)} AND json_extract(${submissions.meta}, '$.files') IS NOT NULL`)
    .all();
}

// ── Signed links (for notifications and webhooks, which can't use the dashboard session) ──

const b64url = (value: string) => btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unb64url = (value: string) => atob(value.replaceAll("-", "+").replaceAll("_", "/"));

export async function signFileToken(env: Pick<Env, "BETTER_AUTH_SECRET">, submissionId: string, fileId: string, expiresAt: number) {
  const payload = b64url(`${submissionId}.${fileId}.${expiresAt}`);
  return `${payload}.${(await hmacHex(env.BETTER_AUTH_SECRET, `file:${payload}`)).slice(0, 40)}`;
}

export async function verifyFileToken(env: Pick<Env, "BETTER_AUTH_SECRET">, token: string, now = Date.now()) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = (await hmacHex(env.BETTER_AUTH_SECRET, `file:${payload}`)).slice(0, 40);
  if (signature.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  let decoded: string;
  try {
    decoded = unb64url(payload);
  } catch {
    return null;
  }
  const [submissionId, fileId, expiresAt] = decoded.split(".");
  if (!submissionId || !fileId || !(Number(expiresAt) > now)) return null;
  return { submissionId, fileId };
}

export async function signedFileLinks(env: Env, submission: Pick<SubmissionRow, "id" | "meta">, now = Date.now()) {
  const files = submission.meta.files ?? [];
  const expiresAt = now + getLimits(env).fileLinkTtlDays * 86_400_000;
  return Promise.all(
    files.map(async (f) => ({
      field: f.field,
      name: f.name,
      size: f.size,
      type: f.type,
      url: `${env.APP_URL}/files/${await signFileToken(env, submission.id, f.id, expiresAt)}`,
    })),
  );
}

/** Images are safe to preview inline; everything else downloads, never renders on our origin. */
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function fileResponse(object: R2ObjectBody, file: StoredFile): Response {
  const inline = INLINE_TYPES.has(file.type);
  return new Response(object.body, {
    headers: {
      "content-type": inline ? file.type : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "content-length": String(object.size),
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cache-control": "private, max-age=300",
    },
  });
}
