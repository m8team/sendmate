/**
 * AES-256-GCM encryption for third-party secrets (BYOK keys, webhook URLs, bot tokens).
 * Format: `v1:<iv base64>:<ciphertext base64>`. The version prefix allows key rotation later.
 */

const keys = new WeakMap<object, Promise<CryptoKey>>();

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function getKey(env: Pick<Env, "ENCRYPTION_KEY">): Promise<CryptoKey> {
  let key = keys.get(env);
  if (!key) {
    const raw = fromBase64(env.ENCRYPTION_KEY ?? "");
    if (raw.byteLength !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    keys.set(env, key);
  }
  return key;
}

export async function encryptSecret(env: Pick<Env, "ENCRYPTION_KEY">, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(env), new TextEncoder().encode(plaintext));
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(env: Pick<Env, "ENCRYPTION_KEY">, value: string): Promise<string> {
  const [version, iv, ciphertext] = value.split(":");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Unsupported secret format");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await getKey(env), fromBase64(ciphertext));
  return new TextDecoder().decode(plaintext);
}

export async function encryptJson(env: Pick<Env, "ENCRYPTION_KEY">, value: unknown): Promise<string> {
  return encryptSecret(env, JSON.stringify(value));
}

export async function decryptJson<T>(env: Pick<Env, "ENCRYPTION_KEY">, value: string): Promise<T> {
  return JSON.parse(await decryptSecret(env, value)) as T;
}

/** URL-safe random token (for email verification links). */
export function randomToken(bytes = 32): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
