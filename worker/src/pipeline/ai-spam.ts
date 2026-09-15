import { eq } from "drizzle-orm";
import { getLimits } from "../config";
import { getDb, type SubmissionRow } from "../db/client";
import { submissions } from "../db/schema";
import { claimCounter } from "../email/budget";
import { dayKey } from "../lib/time";

/** A small, fast instruct model keeps each check to a few neurons of the free daily allowance. */
export const AI_SPAM_MODEL = "@cf/meta/llama-3.2-3b-instruct";
export const AI_SPAM_THRESHOLD = 80;
const MAX_INPUT_CHARS = 2_000;

const SYSTEM_PROMPT =
  "You review submissions from website contact forms. Reply with only a whole number from 0 to 100: " +
  "the probability that the submission is spam (unsolicited SEO or marketing offers, scams, crypto or loan pitches, " +
  "link dumps, gibberish, or automated junk). Genuine questions, leads, feedback and complaints are not spam, " +
  "even if they're short, rude or contain a link.";

export function submissionText(data: SubmissionRow["data"]): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("\n")
    .slice(0, MAX_INPUT_CHARS);
}

export function parseScore(output: unknown): number | null {
  const text = typeof output === "string" ? output : (output as { response?: unknown } | null)?.response;
  if (typeof text !== "string") return null;
  const match = text.match(/\b(\d{1,3})\b/);
  if (!match) return null;
  const score = Number(match[1]);
  return score >= 0 && score <= 100 ? score : null;
}

/**
 * Scores a stored submission with Workers AI. Returns null when AI isn't bound, the daily cap is
 * used, or the model fails. It never blocks delivery on an AI problem.
 */
export async function aiSpamScore(env: Env, submission: Pick<SubmissionRow, "data">, now = Date.now()): Promise<number | null> {
  if (!env.AI) return null;
  if (!(await claimCounter(env.DB, "ai_spam_check", "all", dayKey(now), getLimits(env).aiSpamChecksPerDay))) return null;
  try {
    const output = await env.AI.run(AI_SPAM_MODEL as never, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: submissionText(submission.data) },
      ],
      max_tokens: 4,
      temperature: 0,
    } as never);
    return parseScore(output);
  } catch (error) {
    console.error("AI spam check failed", error);
    return null;
  }
}

/** Runs the AI check and moves the submission to spam if it's confident. Returns true if it did. */
export async function applyAiSpamCheck(env: Env, submission: Pick<SubmissionRow, "id" | "data" | "meta" | "spamScore">): Promise<boolean> {
  const score = await aiSpamScore(env, submission);
  if (score === null || score < AI_SPAM_THRESHOLD) return false;
  await getDb(env)
    .update(submissions)
    .set({
      status: "spam",
      spamScore: Math.max(submission.spamScore, score / 100),
      meta: { ...submission.meta, spamReasons: [...submission.meta.spamReasons, `ai:${score}`] },
    })
    .where(eq(submissions.id, submission.id));
  return true;
}
