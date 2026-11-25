import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { markdownPathFor, prefersMarkdown } from "../src/routes/markdown";

/** Static files as the ASSETS binding would serve them, without needing a web build. */
const files: Record<string, { body: string; type: string }> = {
  "/": { body: "<!doctype html><h1>sendm8</h1>", type: "text/html" },
  "/docs/": { body: "<!doctype html><h1>Docs</h1>", type: "text/html" },
  "/docs/ajax/": { body: "<!doctype html><h1>AJAX</h1>", type: "text/html" },
  "/llms.txt": { body: "# sendm8\n\nQuickstart", type: "text/plain" },
  "/llms-full.txt": { body: "# sendm8 docs", type: "text/plain" },
  "/docs/ajax.md": { body: "## AJAX / fetch", type: "text/markdown" },
};
const assets = {
  fetch: async (input: Request | URL | string) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    const file = files[path];
    return file ? new Response(file.body, { headers: { "content-type": file.type } }) : new Response("Not found", { status: 404 });
  },
};

async function get(path: string, accept?: string) {
  return worker.fetch(
    new Request(`https://sendm8.test${path}`, { headers: accept ? { accept } : {} }),
    { ...env, ASSETS: assets } as unknown as Env,
    { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext,
  );
}

describe("Accept: text/markdown", () => {
  it("only counts Markdown that's ranked above HTML", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/html;q=0.9")).toBe(true);
    expect(prefersMarkdown("text/html, text/markdown;q=0.5")).toBe(false);
    expect(prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
    expect(prefersMarkdown(undefined)).toBe(false);
  });

  it("maps the home page and docs to their Markdown", () => {
    expect(markdownPathFor("/")).toBe("/llms.txt");
    expect(markdownPathFor("/docs/")).toBe("/llms-full.txt");
    expect(markdownPathFor("/docs/ajax/")).toBe("/docs/ajax.md");
    expect(markdownPathFor("/docs/ajax.md")).toBeNull();
    expect(markdownPathFor("/pricing/")).toBeNull();
  });

  it("serves Markdown to coding agents and HTML to browsers, varying on Accept", async () => {
    const agent = await get("/docs/ajax/", "text/markdown, text/html;q=0.9");
    expect(agent.headers.get("content-type")).toContain("text/markdown");
    expect(agent.headers.get("vary")).toContain("Accept");
    expect(await agent.text()).toBe("## AJAX / fetch");

    const home = await get("/", "text/markdown");
    expect(await home.text()).toContain("Quickstart");

    const browser = await get("/docs/ajax/", "text/html,*/*;q=0.8");
    expect(browser.headers.get("content-type")).toContain("text/html");
    expect(browser.headers.get("vary")).toContain("Accept");
    expect(await browser.text()).toContain("<h1>AJAX</h1>");
  });

  it("falls back to the page when a docs path has no Markdown", async () => {
    const res = await get("/docs/no-such-section/", "text/markdown");
    expect(res.status).toBe(404);
  });
});
