export function wantsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  return (
    accept.includes("application/json") ||
    contentType.includes("application/json") ||
    request.headers.get("x-requested-with")?.toLowerCase() === "xmlhttprequest"
  );
}

export function clientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Parses an absolute http(s) URL, or returns null. Rejects javascript:, data:, etc. */
export function parseHttpUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** Hostname the request came from, via Origin then Referer. */
export function requestHost(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    const url = parseHttpUrl(origin);
    if (url) return url.hostname.toLowerCase();
  }
  return parseHttpUrl(request.headers.get("referer"))?.hostname.toLowerCase() ?? null;
}

/**
 * A developer's own machine (`localhost`, `127.x.x.x`, `::1`). Forms always accept posts from these,
 * so testing on a dev server works with an allowlist set. It costs nothing: a script can claim any
 * Origin anyway, so an allowlist only ever guards against other websites in a real browser.
 */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

/**
 * True when `host` matches an allowed entry exactly or is a subdomain of it.
 * `example.com` allows `example.com` and `www.example.com`, but not `badexample.com`.
 */
export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((entry) => {
    if (entry === "*") return true;
    const e = entry.toLowerCase().replace(/^\*\./, "");
    return h === e || h.endsWith(`.${e}`);
  });
}
