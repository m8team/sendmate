import type { SubmitFieldError } from "@sendm8/shared";

export class SubmitError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The fields at fault, when the problem is with particular fields rather than the whole submission. */
    readonly fields: SubmitFieldError[] = [],
  ) {
    super(message);
  }
}

/** One or more fields failed validation. The message lists them all, for pages that can't show them by field. */
export function invalidFields(errors: SubmitFieldError[]): SubmitError {
  return new SubmitError(422, "invalid_fields", [...new Set(errors.map((e) => e.message))].join(" "), errors);
}
