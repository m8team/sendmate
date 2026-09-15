import type { FormDto, SubmissionDto } from "@sendm8/shared";
import type { FormRow, SubmissionRow } from "../db/client";

export function toFormDto(
  form: FormRow,
  appUrl: string,
  extra: Pick<FormDto, "submissionsThisMonth" | "monthlyLimit" | "lastSubmissionAt">,
): FormDto {
  return {
    id: form.id,
    name: form.name,
    status: form.status,
    endpoint: `${appUrl}/f/${form.id}`,
    allowedOrigins: form.allowedOrigins,
    redirectUrl: form.redirectUrl,
    settings: form.settings,
    flaggedReason: form.flaggedReason,
    turnstileConfigured: form.turnstileSecretEnc !== null,
    emailEndpoint: form.ownerEmail ? `${appUrl}/f/${form.ownerEmail}` : null,
    createdAt: form.createdAt,
    ...extra,
  };
}

export const HELD_PLACEHOLDER = "[held for review]";

/**
 * Never exposes the IP hash. Held submissions (possible phishing, or a flagged form) keep their
 * field names but hide values: if the form is harvesting credentials, its owner is the attacker.
 */
export function toSubmissionDto(row: SubmissionRow): SubmissionDto {
  const held = row.status === "held";
  return {
    id: row.id,
    formId: row.formId,
    data: held ? Object.fromEntries(Object.keys(row.data).map((key) => [key, HELD_PLACEHOLDER])) : row.data,
    status: row.status,
    spamScore: row.spamScore,
    starred: row.starred,
    createdAt: row.createdAt,
    country: row.meta.country,
    referrer: row.meta.referrer,
    userAgent: row.meta.userAgent,
    special: held ? {} : row.meta.special,
    spamReasons: row.meta.spamReasons,
    droppedFiles: row.meta.droppedFiles ?? [],
    files: held
      ? []
      : (row.meta.files ?? []).map(({ key: _key, ...file }) => ({ ...file, url: `/api/submissions/${row.id}/files/${file.id}` })),
    deliveries: row.deliveries,
    retryAt: row.retryAt,
  };
}
