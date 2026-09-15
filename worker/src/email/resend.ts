const RESEND_API = "https://api.resend.com";

export interface EmailMessage {
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /** Resend de-duplicates sends with the same key for 24h, so retries never double-send. */
  idempotencyKey?: string;
}

export type SendResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      /** Worth trying again later (rate limit, quota, outage). */
      retryable: boolean;
      /** The key or sending domain is unusable (revoked, restricted, unverified domain). */
      keyRejected: boolean;
    };

interface ResendErrorBody {
  name?: string;
  message?: string;
}

async function readError(res: Response): Promise<ResendErrorBody> {
  try {
    return (await res.json()) as ResendErrorBody;
  } catch {
    return {};
  }
}

export async function sendWithResend(apiKey: string, message: EmailMessage): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(message.idempotencyKey && { "idempotency-key": message.idempotencyKey.slice(0, 256) }),
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        ...(message.cc?.length && { cc: message.cc }),
        ...(message.replyTo && { reply_to: message.replyTo }),
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    return { ok: false, error: `network: ${String(error).slice(0, 200)}`, retryable: true, keyRejected: false };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id ?? "" };
  }

  const body = await readError(res);
  const error = `${res.status} ${body.name ?? "error"}: ${body.message ?? res.statusText}`.slice(0, 300);
  if (res.status === 429 || res.status >= 500) return { ok: false, error, retryable: true, keyRejected: false };
  if (res.status === 401 || res.status === 403) return { ok: false, error, retryable: false, keyRejected: true };
  return { ok: false, error, retryable: false, keyRejected: false };
}

export type KeyValidation =
  | { ok: true; restricted: boolean }
  | { ok: false; error: string };

export type DomainList =
  | { ok: true; restricted: false; domains: { name: string; status: string }[] }
  | { ok: true; restricted: true; domains: [] }
  | { ok: false; error: string };

/** Lists the account's sending domains. Sending-only keys can't, which is reported as `restricted`. */
export async function listResendDomains(apiKey: string): Promise<DomainList> {
  let res: Response;
  try {
    res = await fetch(`${RESEND_API}/domains`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { ok: false, error: "Couldn't reach Resend. Try again in a moment." };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({ data: [] }))) as { data?: { name: string; status: string }[] };
    return { ok: true, restricted: false, domains: (body.data ?? []).map((d) => ({ name: d.name.toLowerCase(), status: d.status })) };
  }

  const body = await readError(res);
  if (res.status === 401 && body.name === "restricted_api_key") return { ok: true, restricted: true, domains: [] };
  if (res.status === 401 || res.status === 403) return { ok: false, error: "Resend didn't accept that API key." };
  return { ok: false, error: `Resend returned an error (${res.status}). Try again in a moment.` };
}

/**
 * Checks a user's Resend key. Full-access keys can list domains, so we also confirm the
 * `from` domain is verified. Sending-only keys can't, so we accept them and let the first send tell us.
 */
export async function validateResendKey(apiKey: string, fromAddress: string): Promise<KeyValidation> {
  const list = await listResendDomains(apiKey);
  if (!list.ok) return list;
  if (list.restricted) return { ok: true, restricted: true };

  const domain = fromAddress.split("@")[1]?.toLowerCase();
  const match = list.domains.find((d) => d.name === domain);
  if (!match) return { ok: false, error: `${domain} isn't a domain in your Resend account.` };
  if (match.status !== "verified") return { ok: false, error: `${domain} isn't verified in Resend yet (status: ${match.status}).` };
  return { ok: true, restricted: false };
}
