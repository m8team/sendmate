import type { ErrorGroupDto, ErrorSource } from "@sendm8/shared";
import { eq, lt, sql } from "drizzle-orm";
import { getLimits } from "../config";
import { getDb } from "../db/client";
import { errorGroups } from "../db/schema";
import { claimCounter } from "../email/budget";
import { sha256Hex } from "../lib/crypto";
import { dayKey } from "../lib/time";
import { notifyOps, type AlertEnv, plain } from "./alerts";

/**
 * Error tracking in the spirit of Sentry, on D1: occurrences are grouped by fingerprint, counted, and
 * alerted on when an error is new, comes back after being resolved, or hits 10, 100 or 1,000 occurrences.
 */

export interface ErrorReport {
  source: ErrorSource;
  name: string;
  message: string;
  stack?: string | null;
  context?: Record<string, string | null | undefined>;
}

export type ErrorEnv = AlertEnv;

const MILESTONES = new Set([10, 100, 1_000, 10_000]);
const MAX_STACK = 6_000;
const MAX_MESSAGE = 1_000;

// ── Scrubbing ───────────────────────────────────────────────────────────────

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** Long strings mixing letters and digits: tokens, keys, ids. Plain identifiers (no digits) survive. */
const TOKEN = /\b(?=[A-Za-z_-]*\d)(?=[\d_-]*[A-Za-z])[A-Za-z0-9_-]{20,}\b/g;
const BEARER = /\b(Bearer|Basic)\s+[^\s"']+/gi;

/** Removes emails, bearer credentials and token-like strings before anything is stored or posted. */
export function scrub(text: string): string {
  return text.replace(BEARER, "$1 [secret]").replace(EMAIL, "[email]").replace(TOKEN, "[token]");
}

/** A URL or path reduced to its path, with token-like segments replaced. Query strings and hashes can hold secrets. */
export function scrubPath(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let path = value;
  try {
    path = new URL(value, "https://x.invalid").pathname;
  } catch {
    path = value.split(/[?#]/)[0] ?? "";
  }
  return scrub(path).slice(0, 300);
}

const BROWSERS: [string, RegExp][] = [
  ["Edge", /Edg\/(\d+)/],
  ["Firefox", /Firefox\/(\d+)/],
  ["Chrome", /Chrome\/(\d+)/],
  ["Safari", /Version\/(\d+).*Safari/],
];
const SYSTEMS: [string, RegExp][] = [
  ["iOS", /iPhone|iPad/],
  ["Android", /Android/],
  ["Windows", /Windows/],
  ["macOS", /Mac OS X/],
  ["Linux", /Linux/],
];

/** "Chrome 140 on Windows" from a user agent. */
export function browserSummary(ua: string | null | undefined): string | undefined {
  if (!ua) return undefined;
  let browser = "Unknown browser";
  for (const [name, pattern] of BROWSERS) {
    const version = ua.match(pattern)?.[1];
    if (version) {
      browser = `${name} ${version}`;
      break;
    }
  }
  const os = SYSTEMS.find(([, pattern]) => pattern.test(ua))?.[0];
  return os ? `${browser} on ${os}` : browser;
}

// ── Grouping ────────────────────────────────────────────────────────────────

/** Top frames as "function file", without line numbers, origins or build hashes, so they survive deploys. */
export function stackFrames(stack: string | null | undefined, limit = 3): string[] {
  if (!stack) return [];
  const frames: string[] = [];
  for (const line of stack.split("\n")) {
    // V8: "at fn (file:1:2)" or "at file:1:2". Firefox/Safari: "fn@file:1:2".
    const v8 = line.match(/^\s*at (?:(.+?) \()?(.+?):\d+:\d+\)?\s*$/);
    const gecko = v8 ? null : line.match(/^\s*([^@\s]*)@(.+?):\d+:\d+\s*$/);
    const match = v8 ?? gecko;
    if (!match) continue;
    const file = (match[2] ?? "")
      .replace(/^[a-z-]+:\/\/[^/]+/i, "")
      .replace(/\.[A-Za-z0-9_-]{8}(?=\.m?js$)/, "")
      .replace(/\?.*$/, "");
    frames.push(`${match[1] || "<anonymous>"} ${file}`.trim());
    if (frames.length === limit) break;
  }
  return frames;
}

/** Message with the variable parts (numbers, quoted values, ids) flattened, for grouping. */
export function normaliseMessage(message: string): string {
  return scrub(message)
    .replace(/(["'`]).*?\1/g, "$1…$1")
    .replace(/\d+/g, "0")
    .slice(0, 200);
}

export async function fingerprint(report: Pick<ErrorReport, "source" | "name" | "message" | "stack">): Promise<string> {
  const parts = [report.source, report.name, normaliseMessage(report.message), ...stackFrames(report.stack)];
  return (await sha256Hex(parts.join("|"))).slice(0, 32);
}

/** Turns anything thrown into a report. */
export function describeError(error: unknown): Pick<ErrorReport, "name" | "message" | "stack"> {
  if (error instanceof Error) return { name: error.name || "Error", message: error.message || String(error), stack: error.stack ?? null };
  if (typeof error === "string") return { name: "Error", message: error, stack: null };
  let message: string;
  try {
    message = JSON.stringify(error) ?? String(error);
  } catch {
    message = String(error);
  }
  return { name: "NonError", message, stack: null };
}

// ── Recording ───────────────────────────────────────────────────────────────

/** Isolate-local backstop for when D1 itself is what's failing: one alert per fingerprint per 10 minutes. */
const recentFallbacks = new Map<string, number>();

/**
 * Records an occurrence and alerts when it's worth a look. Never throws.
 * Returns the group id, or null if it wasn't recorded (daily cap, or D1 unavailable).
 */
export async function recordError(env: ErrorEnv, report: ErrorReport, now = Date.now()): Promise<string | null> {
  const clean: ErrorReport = {
    source: report.source,
    name: plain(report.name || "Error", 100),
    message: scrub(report.message || "(no message)").slice(0, MAX_MESSAGE),
    stack: report.stack ? scrub(report.stack).slice(0, MAX_STACK) : null,
    context: Object.fromEntries(Object.entries(report.context ?? {}).flatMap(([k, v]) => (v ? [[k, scrub(String(v)).slice(0, 300)]] : []))),
  };
  let id = "";
  try {
    id = await fingerprint(clean);
    if (!(await claimCounter(env.DB, "error_events", "all", dayKey(now), getLimits(env).errorEventsPerDay))) return null;

    const db = getDb(env);
    const existing = await db.select({ count: errorGroups.count, resolvedAt: errorGroups.resolvedAt }).from(errorGroups).where(eq(errorGroups.id, id)).get();
    const context = clean.context as Record<string, string>;
    await db
      .insert(errorGroups)
      .values({ id, source: clean.source, name: clean.name, message: clean.message, stack: clean.stack, context, count: 1, firstSeenAt: now, lastSeenAt: now })
      .onConflictDoUpdate({
        target: errorGroups.id,
        set: { count: sql`${errorGroups.count} + 1`, lastSeenAt: now, message: clean.message, stack: clean.stack, context, resolvedAt: null },
      });

    const count = (existing?.count ?? 0) + 1;
    const reason = !existing ? "new" : existing.resolvedAt !== null ? "regressed" : MILESTONES.has(count) ? "milestone" : null;
    if (reason) await notifyOps(env, errorAlert(clean, reason, count), now);
    return id;
  } catch (error) {
    console.error("recording error failed", error);
    const key = id || `${clean.name}:${clean.message}`;
    const last = recentFallbacks.get(key);
    if (last === undefined || last < now - 10 * 60_000) {
      recentFallbacks.set(key, now);
      await notifyOps(env, errorAlert(clean, "unrecorded", 1), now, { skipCounters: true });
    }
    return null;
  }
}

/** Logs and records an error from the Worker. Never throws, so it's safe in catch blocks and waitUntil. */
export async function captureError(env: ErrorEnv, error: unknown, context: Record<string, string | null | undefined> = {}): Promise<void> {
  console.error(context.where ?? "error", error);
  await recordError(env, { source: "worker", ...describeError(error), context });
}

function errorAlert(report: ErrorReport, reason: "new" | "regressed" | "milestone" | "unrecorded", count: number) {
  const where = report.source === "worker" ? "Worker" : "Browser";
  const title = {
    new: `New ${where.toLowerCase()} error`,
    regressed: `${where} error is back after being resolved`,
    milestone: `${where} error has happened ${count.toLocaleString("en-GB")} times`,
    unrecorded: `${where} error (couldn't be saved to the database)`,
  }[reason];
  const stack = report.stack ? report.stack.split("\n").slice(0, 8).join("\n").replace(/`/g, "'") : "";
  const context = report.context ?? {};
  return {
    kind: "error" as const,
    title,
    description: `**${plain(report.name, 100)}**: ${plain(report.message, 500)}${stack ? `\n\`\`\`\n${stack.slice(0, 1500)}\n\`\`\`` : ""}`,
    fields: Object.entries(context).flatMap(([name, value]) => (value ? [{ name, value: plain(value, 200) }] : [])),
    path: "/app/admin#ad-errors",
  };
}

// ── Admin ───────────────────────────────────────────────────────────────────

export const toErrorGroupDto = (row: typeof errorGroups.$inferSelect): ErrorGroupDto => ({
  id: row.id,
  source: row.source as ErrorSource,
  name: row.name,
  message: row.message,
  stack: row.stack,
  context: row.context,
  count: row.count,
  firstSeenAt: row.firstSeenAt,
  lastSeenAt: row.lastSeenAt,
  resolvedAt: row.resolvedAt,
});

/** Deletes groups not seen within the retention period. */
export async function purgeOldErrors(env: Pick<Env, "DB" | "LIMITS_JSON">, now: number) {
  const cutoff = now - getLimits(env).errorRetentionDays * 86_400_000;
  await getDb(env).delete(errorGroups).where(lt(errorGroups.lastSeenAt, cutoff));
}
