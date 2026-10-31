import { eq } from "drizzle-orm";
import { getLimits } from "../config";
import { getDb, type SubmissionRow } from "../db/client";
import { submissions } from "../db/schema";
import { claimCounter } from "../email/budget";
import { plusBase } from "../lib/email-address";
import { dayKey } from "../lib/time";
import { captureError } from "../ops/errors";
import { submitterEmail } from "./spam";

/**
 * Small enough to stay inside the free allowance (~0.8 neurons a check, so the daily cap of
 * aiSpamChecksPerDay costs under a tenth of it), big enough to tell a complaint from a sales pitch.
 * The 3B model it replaced answered "83" to almost everything, genuine messages included.
 */
export const AI_SPAM_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
/**
 * Only a confident model answer bins a submission on its own. A genuine "I'd like to collaborate"
 * enquiry to a freelancer's portfolio scored exactly 80 in production, while real spam scores 95-100,
 * so the line sits at 90. Scores below it are still recorded, and show in the inbox as suspicious.
 */
export const AI_SPAM_THRESHOLD = 90;
const MAX_INPUT_CHARS = 2_000;
/** D1 queries one check costs: claiming the daily counter, then recording the score. */
export const AI_CHECK_QUERIES = 2;

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

/**
 * Workers AI answers in more than one shape: `response` can be a string or already a number, and
 * newer models also return an OpenAI-style `choices[0].message.content`. Accept all of them.
 */
export function parseScore(output: unknown): number | null {
  const body = output as { response?: unknown; choices?: { message?: { content?: unknown } }[] } | null;
  const candidate = typeof output === "string" || typeof output === "number" ? output : (body?.response ?? body?.choices?.[0]?.message?.content);

  const score = typeof candidate === "number" ? candidate : typeof candidate === "string" ? Number(candidate.match(/\b(\d{1,3})\b/)?.[1]) : NaN;
  return Number.isInteger(score) && score >= 0 && score <= 100 ? score : null;
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
    await captureError(env, error, { where: "AI spam check" });
    return null;
  }
}

/**
 * The model is small and judges mostly English well, but it scored ordinary Persian and Chinese
 * enquiries 100. So for text mostly in a non-Latin script its score is kept, and shows as suspicious,
 * but it can't bin the message on its own. The heuristics still apply to everything.
 */
export function mostlyNonLatin(data: SubmissionRow["data"]): boolean {
  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+$/.test(v.trim());
  const text = Object.values(data)
    .flat()
    .filter((v): v is string => typeof v === "string" && !isEmail(v))
    .join(" ");
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 4) return false;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return (letters.length - latin) / letters.length >= 0.5;
}

/**
 * Someone trying out their own form signs it with their own address, and their "is this thing on?"
 * message reads like junk to the model (one scored 95). Only a clean submission is let off: the
 * endpoint address is public, so a spammer could copy it, but links or other red flags still count.
 */
export function ownerIsTesting(submission: Pick<SubmissionRow, "data" | "meta">, ownerEmail: string | null): boolean {
  if (!ownerEmail || submission.meta.spamReasons.length > 0) return false;
  const from = submitterEmail({ fields: submission.data, special: submission.meta.special });
  return from !== null && plusBase(from) === plusBase(ownerEmail);
}

/**
 * Runs the AI check and records what the model thought, so the inbox can show "a bit suspicious"
 * instead of a bare zero. Only a confident score moves the submission to spam.
 * Returns true when it did, which stops delivery.
 */
export async function applyAiSpamCheck(
  env: Env,
  submission: Pick<SubmissionRow, "id" | "data" | "meta" | "spamScore">,
  ownerEmail: string | null = null,
): Promise<boolean> {
  if (ownerIsTesting(submission, ownerEmail)) return false;
  const score = await aiSpamScore(env, submission);
  if (score === null) return false;
  const spam = score >= AI_SPAM_THRESHOLD && !mostlyNonLatin(submission.data);
  await getDb(env)
    .update(submissions)
    .set({
      ...(spam && { status: "spam" }),
      spamScore: Math.max(submission.spamScore, score / 100),
      meta: { ...submission.meta, spamReasons: [...submission.meta.spamReasons, `ai:${score}`] },
    })
    .where(eq(submissions.id, submission.id));
  return spam;
}
