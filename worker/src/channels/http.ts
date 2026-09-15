export type ChannelResult = { ok: true } | { ok: false; error: string; retryable: boolean };

export const USER_AGENT = "sendm8/1.0 (+https://sendm8.com)";

interface PostOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * POSTs JSON and classifies the outcome for the retry logic. Redirects are never followed,
 * so a destination can't bounce us somewhere else.
 */
export async function postJson(url: string, body: string, { headers = {}, timeoutMs = 5_000 }: PostOptions = {}): Promise<ChannelResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT, ...headers },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    // Never echo the error message: it can contain the URL, and URLs can contain secrets.
    return { ok: false, error: timedOut ? `timeout after ${timeoutMs}ms` : "network error", retryable: true };
  }
  return classify(res);
}

export async function classify(res: Response): Promise<ChannelResult> {
  if (res.status >= 200 && res.status < 300) return { ok: true };
  const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  const error = `${res.status}${detail ? ` ${detail}` : ""}`;
  if (res.status >= 300 && res.status < 400) return { ok: false, error: `${res.status} redirects aren't followed`, retryable: false };
  if (res.status === 408 || res.status === 429 || res.status >= 500) return { ok: false, error, retryable: true };
  return { ok: false, error, retryable: false };
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
