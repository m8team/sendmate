/**
 * Checks a Svix-signed webhook, the scheme Resend uses (https://docs.svix.com/receiving/verifying-payloads/how-manual).
 * The signature covers `${id}.${timestamp}.${body}`, is HMAC-SHA256 keyed by the base64 part of the
 * `whsec_…` secret, and arrives as space-separated `v1,<base64>` entries. Old timestamps are refused,
 * so a captured request can't be replayed later.
 */
const TOLERANCE_MS = 5 * 60_000;

const fromBase64 = (value: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

export async function verifyWebhookSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now(),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > TOLERANCE_MS) return false;

  const keyBytes = fromBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  if (!keyBytes || keyBytes.length === 0) return false;
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);

  for (const entry of signature.split(" ")) {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) continue;
    const bytes = fromBase64(value);
    // subtle.verify compares in constant time.
    if (bytes && (await crypto.subtle.verify("HMAC", key, bytes, signed))) return true;
  }
  return false;
}
