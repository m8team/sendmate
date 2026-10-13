/**
 * Security headers on every response: the Worker's (worker/src/lib/security-headers.ts) and the static
 * site's (web/public/_headers, which a test keeps in step with this list).
 *
 * Framing is limited to our own origin, so another site can't load the dashboard in a hidden frame and
 * trick a signed-in owner into clicking (clickjacking). The /emails page frames its own preview, hence
 * 'self' rather than 'none'. A fuller Content-Security-Policy would also need to allow Turnstile, the
 * analytics beacon and Astro's inline scripts, so for now the policy only covers framing.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};
