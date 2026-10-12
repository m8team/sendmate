/**
 * Sending a submission to sendm8, with no React in sight. The hook is a thin layer over this.
 */

export interface FieldError {
  code: string;
  message: string;
  field?: string;
}

/**
 * What went wrong, shaped like @formspree/react's SubmissionError so `getFormErrors()` and
 * `<ValidationError>` keep working. sendm8 reports one form-level error per failure, never per field.
 */
export class SubmissionError {
  readonly errors: FieldError[];

  constructor(...errors: FieldError[]) {
    this.errors = errors;
  }

  getFormErrors(): FieldError[] {
    return this.errors.filter((e) => !e.field);
  }

  getFieldErrors(field: string): FieldError[] {
    return this.errors.filter((e) => e.field === field);
  }

  getAllFieldErrors(): [string, FieldError[]][] {
    const fields = [...new Set(this.errors.flatMap((e) => (e.field ? [e.field] : [])))];
    return fields.map((f) => [f, this.getFieldErrors(f)]);
  }
}

export interface SubmissionSuccess {
  /** The submission's id, as shown in the sendm8 dashboard. */
  id: string;
  /** Where sendm8 would have redirected a plain HTML form, when the form sets one. */
  next?: string;
}

export type SubmitData = FormData | Record<string, unknown>;
export type ExtraData = Record<string, string | (() => string) | undefined>;

export const DEFAULT_ENDPOINT = "https://sendm8.com";

/**
 * A form id ("k3x9q2m7ab"), an email address for a no-signup endpoint, or a full URL
 * (for self-hosted sendm8, or a URL pasted straight from the dashboard).
 */
export function endpointFor(formKey: string, endpoint = DEFAULT_ENDPOINT): string {
  const key = formKey.trim();
  if (!key) throw new Error("@sendm8/react: useForm needs a form id, email address or endpoint URL.");
  if (/^https?:\/\//i.test(key)) return key;
  return `${endpoint.replace(/\/+$/, "")}/f/${key}`;
}

/** A form element's fields, or a plain object, plus any extra `data`. Files survive in FormData. */
export function toBody(data: SubmitData, extra: ExtraData = {}): FormData | string {
  const values = Object.entries(extra).flatMap(([k, v]) => (v === undefined ? [] : [[k, typeof v === "function" ? v() : v] as const]));
  if (data instanceof FormData) {
    const body = new FormData();
    for (const [k, v] of data) body.append(k, v);
    for (const [k, v] of values) body.set(k, v);
    return body;
  }
  return JSON.stringify({ ...data, ...Object.fromEntries(values) });
}

export type SubmitResult = { ok: true; result: SubmissionSuccess } | { ok: false; error: SubmissionError };

export async function submit(url: string, data: SubmitData, extra: ExtraData = {}, fetchImpl: typeof fetch = fetch): Promise<SubmitResult> {
  const body = toBody(data, extra);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      body,
      // FormData sets its own multipart boundary, so only JSON gets a content type.
      headers: typeof body === "string" ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "application/json" },
    });
  } catch {
    return { ok: false, error: new SubmissionError({ code: "network_error", message: "Couldn't reach the form. Check your connection and try again." }) };
  }

  const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; next?: string; error?: { code?: string; message?: string } } | null;
  if (res.ok && json?.ok) return { ok: true, result: { id: json.id ?? "", ...(json.next && { next: json.next }) } };
  return {
    ok: false,
    error: new SubmissionError({
      code: json?.error?.code ?? `http_${res.status}`,
      message: json?.error?.message ?? "Something went wrong sending the form. Please try again.",
    }),
  };
}
