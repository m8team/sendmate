const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";
export const CHALLENGE_ACTION = "sendm8-challenge";
export const REPORT_ACTION = "sendm8-report";

export type TurnstileResult = { success: true } | { success: false; errorCodes: string[]; unavailable: boolean };

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
  action?: string;
  hostname?: string;
}

/** Cloudflare's documented dummy secrets (1x…, 2x…, 3x…) don't report real hostnames. */
const isTestSecret = (secret: string) => /^[123]x0{30,}AA$/.test(secret);

export async function verifyTurnstile(
  secret: string,
  token: string | undefined,
  opts: { remoteIp?: string | null; expectedAction?: string; expectedHostname?: string } = {},
): Promise<TurnstileResult> {
  if (!token) return { success: false, errorCodes: ["missing-input-response"], unavailable: false };
  if (token.length > 2048) return { success: false, errorCodes: ["invalid-input-response"], unavailable: false };

  const body = new URLSearchParams({ secret, response: token, idempotency_key: crypto.randomUUID() });
  if (opts.remoteIp) body.set("remoteip", opts.remoteIp);

  let json: SiteverifyResponse;
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return { success: false, errorCodes: [`http-${res.status}`], unavailable: true };
    json = (await res.json()) as SiteverifyResponse;
  } catch {
    return { success: false, errorCodes: ["network-error"], unavailable: true };
  }

  if (!json.success) return { success: false, errorCodes: json["error-codes"] ?? [], unavailable: false };
  // Bind tokens to where they were issued so a token from another page can't be replayed here.
  if (opts.expectedAction && json.action && json.action !== opts.expectedAction) {
    return { success: false, errorCodes: ["action-mismatch"], unavailable: false };
  }
  if (opts.expectedHostname && json.hostname && json.hostname !== opts.expectedHostname && !isTestSecret(secret)) {
    return { success: false, errorCodes: ["hostname-mismatch"], unavailable: false };
  }
  return { success: true };
}

/**
 * Checks a user-supplied secret key without a real token: siteverify reports
 * `invalid-input-secret` for bad secrets and `invalid-input-response` for bad tokens.
 */
export async function checkTurnstileSecret(secret: string): Promise<"valid" | "invalid" | "unavailable"> {
  const result = await verifyTurnstile(secret, "sendm8-secret-check");
  if (result.success) return "valid";
  if (result.unavailable) return "unavailable";
  return result.errorCodes.includes("invalid-input-secret") ? "invalid" : "valid";
}

export const turnstileEnabled = (env: Pick<Env, "TURNSTILE_SITE_KEY" | "TURNSTILE_SECRET_KEY">) =>
  Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
