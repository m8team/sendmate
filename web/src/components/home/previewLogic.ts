/**
 * Pure logic behind the homepage's live previews: the endpoint line that follows
 * the visitor's email, and what each channel receives for a submission. Formats mirror
 * the Worker's real output (worker/src/email/templates.ts, worker/src/channels/*,
 * docs/webhooks.md), so keep them in step if those change.
 */

export const PLACEHOLDER_EMAIL = 'you@example.com';
export const FORM_NAME = 'Contact';

export interface Fields {
  name: string;
  email: string;
  message: string;
}

export interface Row {
  name: string;
  value: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value: string) => EMAIL_RE.test(value.trim());

/** The address shown in the endpoint: what they typed, or the placeholder while it's empty. */
export function addressFor(input: string): string {
  const v = input.trim();
  return v === '' ? PLACEHOLDER_EMAIL : v;
}

export const endpointFor = (base: string, input: string) => `${base}${addressFor(input)}`;

export const snippetFor = (base: string, input: string) => `<form action="${endpointFor(base, input)}" method="POST">`;

/** Fields as the Worker stores them: in form order, empty ones kept so the preview never jumps. */
export function rowsFor(f: Fields): Row[] {
  return [
    { name: 'name', value: f.name.trim() },
    { name: 'email', value: f.email.trim() },
    { name: 'message', value: f.message.trim() },
  ];
}

export const titleFor = (formName = FORM_NAME) => `New submission: ${formName}`;

/** Reply-To is whoever wrote in, when the email field is a real address. */
export const replyToFor = (f: Fields) => (isEmail(f.email) ? f.email.trim() : null);

export function webhookBody(f: Fields, opts: { id: string; createdAt: string; referrer: string }): string {
  const data: Record<string, string> = {};
  for (const r of rowsFor(f)) data[r.name] = r.value;
  return JSON.stringify(
    {
      event: 'submission.created',
      form: { id: 'k3x9q2m7ab', name: FORM_NAME },
      submission: {
        id: opts.id,
        createdAt: opts.createdAt,
        data,
        subject: null,
        replyTo: replyToFor(f),
        referrer: opts.referrer,
        country: 'GB',
      },
    },
    null,
    2,
  );
}
