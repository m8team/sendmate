import type { Context } from "hono";
import type { AppEnv } from "../app";

/**
 * Coding agents (Claude Code, OpenCode and others) ask for pages with `Accept: text/markdown`.
 * The docs already exist as Markdown (llms.txt, llms-full.txt and /docs/<section>.md), so the
 * home page and the docs answer those requests with it instead of HTML. Browsers never prefer
 * Markdown, so they get the static page as before.
 */

/** q-value of a media type in an Accept header, or 0 when it isn't listed. */
function quality(accept: string, type: string): number {
  for (const part of accept.split(",")) {
    const [media, ...params] = part.trim().toLowerCase().split(";");
    if (media?.trim() !== type) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const value = q ? Number(q.slice(2)) : 1;
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
}

/** True when the client ranks Markdown above HTML. */
export function prefersMarkdown(accept: string | undefined): boolean {
  if (!accept) return false;
  const markdown = quality(accept, "text/markdown");
  return markdown > 0 && markdown > quality(accept, "text/html");
}

/** The Markdown file for a page, or null if that page has none. */
export function markdownPathFor(pathname: string): string | null {
  if (pathname === "/") return "/llms.txt";
  if (pathname === "/docs" || pathname === "/docs/") return "/llms-full.txt";
  const section = pathname.match(/^\/docs\/([a-z0-9-]+)\/?$/)?.[1];
  return section ? `/docs/${section}.md` : null;
}

/** Mounted on /, /docs and /docs/* (see index.ts and run_worker_first in wrangler.jsonc). */
export async function markdownOrPage(c: Context<AppEnv>): Promise<Response> {
  const url = new URL(c.req.url);
  const assets = c.env.ASSETS;
  if (!assets) return c.notFound();

  const markdownPath = prefersMarkdown(c.req.header("accept")) ? markdownPathFor(url.pathname) : null;
  if (markdownPath) {
    const asset = await assets.fetch(new URL(markdownPath, url));
    if (asset.ok) {
      const res = new Response(asset.body, asset);
      res.headers.set("content-type", "text/markdown; charset=utf-8");
      res.headers.set("vary", "Accept");
      return res;
    }
  }

  const page = await assets.fetch(c.req.raw);
  const res = new Response(page.body, page);
  // The same URL answers with HTML or Markdown, so caches must key on Accept.
  if (markdownPathFor(url.pathname)) res.headers.append("vary", "Accept");
  return res;
}
