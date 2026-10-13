import type { SubmitFieldError } from "@sendm8/shared";
import { isEmail } from "./deliver";
import type { ParsedSubmission } from "./parse";

/**
 * Fields whose meaning we rely on, checked the way Formspree checks them: `email` and `_replyto` must be
 * email addresses when they're filled in. (Empty is fine; `required` in the HTML decides that.) A bad
 * one would otherwise be stored, then quietly dropped as the reply-to address.
 */
const EMAIL_FIELDS = ["email", "_replyto"] as const;

export function validateFields(parsed: ParsedSubmission): SubmitFieldError[] {
  const errors: SubmitFieldError[] = [];
  for (const field of EMAIL_FIELDS) {
    const raw = field.startsWith("_") ? parsed.special[field] : parsed.fields[field];
    const values = (Array.isArray(raw) ? raw : [raw]).map((v) => v?.trim()).filter(Boolean);
    if (values.some((v) => !isEmail(v))) errors.push({ field, code: "invalid_email", message: "Enter a valid email address." });
  }
  return errors;
}
