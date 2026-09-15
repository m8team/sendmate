import { escapeHtml } from "../lib/http";

interface PageOptions {
  title: string;
  heading: string;
  /** Already-escaped HTML. */
  body: string;
  status?: number;
  /** Extra trusted markup for <head>, e.g. third-party scripts. */
  head?: string;
}

/**
 * Minimal server-rendered pages (thank-you, errors). These are shown to other people's
 * visitors, so they stay quiet and fast. The designed versions from web/ replace them in M7.
 */
export function renderPage({ title, heading, body, status = 200, head = "" }: PageOptions): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; --bg: #f4efe6; --ink: #141414; --muted: #5b5750; --signal: #e8412c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #141414; --ink: #f4efe6; --muted: #a39e95; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
         background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 34rem; width: 100%; }
  h1 { font-size: clamp(2rem, 6vw, 3.25rem); line-height: 1.05; margin: 0 0 16px; letter-spacing: -0.02em; }
  p { margin: 0 0 16px; color: var(--muted); }
  a { color: inherit; }
  .stamp { display: inline-block; border: 2px solid var(--signal); color: var(--signal); padding: 2px 10px;
           font: 600 12px/1.6 ui-monospace, monospace; letter-spacing: 0.12em; text-transform: uppercase;
           transform: rotate(-3deg); margin-bottom: 20px; }
  footer { margin-top: 40px; font-size: 13px; color: var(--muted); }
</style>
${head}
</head>
<body>
<main>
<h1>${escapeHtml(heading)}</h1>
${body}
<footer>Powered by <a href="https://sendm8.com">sendm8</a></footer>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export function stamp(label: string): string {
  return `<span class="stamp">${escapeHtml(label)}</span>`;
}
