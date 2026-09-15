/**
 * Guards user-supplied outbound URLs (webhooks). Workers can't resolve DNS before fetching,
 * so this blocks the obvious cases (IP literals in private ranges, internal hostnames, our own
 * host); the runtime itself refuses to connect to private networks as a second layer.
 */

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];
const ALLOWED_PORTS = new Set(["", "443", "8443"]);

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a! >= 224
  );
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) addresses embed an IPv4 address.
  // The URL parser normalises the dotted form to hex (e.g. ::ffff:a00:1), so decode both.
  const embedded = h.match(/^(?:::ffff:|64:ff9b::)(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (embedded) {
    const [, dotted, high, low] = embedded;
    const v4 = dotted
      ? parseIpv4(dotted)
      : [parseInt(high!, 16) >> 8, parseInt(high!, 16) & 255, parseInt(low!, 16) >> 8, parseInt(low!, 16) & 255];
    return !v4 || isPrivateIpv4(v4);
  }
  return false;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export function checkOutboundUrl(raw: string, ownHost?: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "must be a valid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "must use https://" };
  if (url.username || url.password) return { ok: false, reason: "must not contain credentials" };
  if (!ALLOWED_PORTS.has(url.port)) return { ok: false, reason: "must use the default https port" };

  const host = url.hostname.toLowerCase();
  const singleLabel = !host.includes(".") && !host.includes(":");
  if (host === "localhost" || singleLabel || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "must be a public hostname" };
  }
  const v4 = parseIpv4(host);
  if ((v4 && isPrivateIpv4(v4)) || (host.startsWith("[") && isPrivateIpv6(host))) {
    return { ok: false, reason: "must not point at a private network address" };
  }
  if (ownHost && (host === ownHost || host.endsWith(`.${ownHost}`))) {
    return { ok: false, reason: "can't point back at sendm8" };
  }
  return { ok: true, url };
}
