import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { randomIp } from "./helpers";

const URL_ = "https://sendm8.test/mcp";

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; result?: any; error?: { code: number; message: string; data?: any } };

function post(body: unknown, headers: Record<string, string> = {}, ip = randomIp()) {
  return SELF.fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "cf-connecting-ip": ip, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function rpc(method: string, params?: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await post({ jsonrpc: "2.0", id: 1, method, ...(params && { params }) }, { "mcp-protocol-version": "2025-06-18", ...headers });
  return { res, body: (await res.json()) as Rpc };
}

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

async function modern(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const name = (params.name ?? params.uri) as string | undefined;
  const res = await post(
    { jsonrpc: "2.0", id: "m1", method, params: { ...params, _meta: MODERN_META } },
    { "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...(name && { "mcp-name": name }), ...headers },
  );
  return { res, body: (await res.json()) as Rpc };
}

const callTool = (name: string, args: Record<string, unknown> = {}) => rpc("tools/call", { name, arguments: args });
const textOf = (body: Rpc) => (body.result.content as { type: string; text: string }[]).map((c) => c.text).join("\n");

describe("MCP: transport", () => {
  it("initializes, echoing a supported protocol version and minting no session", async () => {
    const res = await post({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("mcp-session-id")).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as Rpc;
    expect(body.id).toBe(0);
    expect(body.result.protocolVersion).toBe("2025-06-18");
    expect(body.result.serverInfo.name).toBe("sendm8");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.instructions).toContain("get_form_snippet");
  });

  it.each(["2025-03-26", "2025-11-25"])("accepts protocol version %s", async (version) => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: version, capabilities: {} } });
    expect(((await res.json()) as Rpc).result.protocolVersion).toBe(version);
  });

  it("answers an unknown version with the latest it supports", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {} } });
    expect(((await res.json()) as Rpc).result.protocolVersion).toBe("2025-11-25");
  });

  it("accepts notifications and stray responses with 202 and no body", async () => {
    const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
    const response = await post({ jsonrpc: "2.0", id: 5, result: {} });
    expect(response.status).toBe(202);
  });

  it("answers ping", async () => {
    const { body } = await rpc("ping");
    expect(body.result).toEqual({});
  });

  it("answers server/discover for legacy clients too, listing every version", async () => {
    const { body } = await rpc("server/discover");
    expect(body.result.supportedVersions).toEqual(["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]);
  });

  it("handles a CORS preflight", async () => {
    const res = await SELF.fetch(URL_, { method: "OPTIONS", headers: { origin: "https://claude.ai", "access-control-request-method": "POST" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toMatch(/Mcp-Protocol-Version/i);
    expect(res.headers.get("access-control-allow-headers")).toMatch(/Mcp-Session-Id/i);
  });

  it.each(["GET", "DELETE"])("refuses %s with 405", async (method) => {
    const res = await SELF.fetch(URL_, { method });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("isn't blocked by the API's same-origin check", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { origin: "https://evil.example", cookie: "x=y" });
    expect(res.status).toBe(200);
  });
});

describe("MCP: JSON-RPC errors", () => {
  it("rejects bad JSON with a parse error", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as Rpc;
    expect(body.id).toBeNull();
    expect(body.error!.code).toBe(-32700);
  });

  it("rejects a non-JSON content type", async () => {
    const res = await post("{}", { "content-type": "text/plain" });
    expect(res.status).toBe(415);
  });

  it.each([
    ["a batch", [{ jsonrpc: "2.0", id: 1, method: "ping" }]],
    ["the wrong jsonrpc version", { jsonrpc: "1.0", id: 1, method: "ping" }],
    ["a null id", { jsonrpc: "2.0", id: null, method: "ping" }],
    ["a missing method", { jsonrpc: "2.0", id: 1 }],
  ])("rejects %s as an invalid request", async (_, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as Rpc).error!.code).toBe(-32600);
  });

  it("rejects params that aren't an object", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: [1] });
    expect(((await res.json()) as Rpc).error!.code).toBe(-32602);
  });

  it("returns method not found for an unknown method", async () => {
    const { body } = await rpc("prompts/list");
    expect(body.error!.code).toBe(-32601);
  });

  it("returns invalid params for an unknown tool", async () => {
    const { body } = await callTool("send_email");
    expect(body.error!.code).toBe(-32602);
    expect(body.error!.message).toContain("get_form_snippet");
  });

  it("rejects arguments that aren't an object", async () => {
    const { body } = await rpc("tools/call", { name: "get_limits", arguments: "x" });
    expect(body.error!.code).toBe(-32602);
  });

  it("refuses a body over 32 KB", async () => {
    const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(40 * 1024) } });
    const res = await post(big);
    expect(res.status).toBe(413);
    expect(((await res.json()) as Rpc).error!.code).toBe(-32600);
  });

  it("refuses a streamed body over 32 KB with no Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(20 * 1024));
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const res = await SELF.fetch(URL_, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": randomIp() }, body, duplex: "half" } as RequestInit);
    expect(res.status).toBe(413);
  });

  it("refuses an unsupported MCP-Protocol-Version header", async () => {
    const { res, body } = await rpc("tools/list", undefined, { "mcp-protocol-version": "1999-01-01" });
    expect(res.status).toBe(400);
    expect(body.error!.code).toBe(-32022);
    expect(body.error!.data.supported).toEqual(expect.arrayContaining(["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]));
  });

  it("rate limits per IP", async () => {
    const ip = randomIp();
    let last: Response | undefined;
    for (let i = 0; i < 125; i++) {
      last = await post({ jsonrpc: "2.0", id: i, method: "ping" }, {}, ip);
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBe("60");
  });
});

describe("MCP: tools", () => {
  it("lists three read-only tools with titles and annotations", async () => {
    const { body } = await rpc("tools/list");
    const tools = body.result.tools as { name: string; title: string; inputSchema: { type: string }; annotations: Record<string, unknown> }[];
    expect(tools.map((t) => t.name)).toEqual(["get_form_snippet", "get_docs", "get_limits"]);
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false, destructiveHint: false });
    }
  });

  it("returns a plain HTML form by default", async () => {
    const { body } = await callTool("get_form_snippet", { email: "owner@mysite.dev" });
    const text = textOf(body);
    expect(body.result.isError).toBeUndefined();
    expect(text).toContain('<form id="contact-form" action="https://sendm8.test/f/owner@mysite.dev" method="POST">');
    expect(text).toContain('name="_gotcha"');
    expect(text).toContain('<input name="email" type="email" required>');
    expect(text).toContain("<textarea name=\"message\" required></textarea>");
    expect(text).not.toContain("fetch(");
    expect(text).toContain("one-time confirmation");
    expect(text).toContain("not an API for emailing other people");
  });

  it("adds fetch handling to HTML when asked", async () => {
    const text = textOf((await callTool("get_form_snippet", { email: "owner@mysite.dev", ajax: true })).body);
    expect(text).toContain('headers: { Accept: "application/json" }');
    expect(text).toContain("result.error.message");
  });

  it("uses a placeholder and says to replace it when no address is given", async () => {
    const text = textOf((await callTool("get_form_snippet", {})).body);
    expect(text).toContain("https://sendm8.test/f/you@example.com");
    expect(text).toContain("Replace you@example.com");
  });

  it("returns a React component that posts with fetch", async () => {
    const text = textOf((await callTool("get_form_snippet", { email: "owner@mysite.dev", framework: "react", fields: ["name", "email", "phone", "message"] })).body);
    expect(text).toContain('const ENDPOINT = "https://sendm8.test/f/owner@mysite.dev";');
    expect(text).toContain('headers: { Accept: "application/json" }');
    expect(text).toContain("setError(result.error.message)");
    expect(text).toContain('<input name="phone" type="tel" />');
    expect(text).toContain('style={{ display: "none" }}');
    expect(text).not.toContain('"use client"');
  });

  it("returns the Lovable prompt and component", async () => {
    const text = textOf((await callTool("get_form_snippet", { email: "owner@mysite.dev", framework: "lovable" })).body);
    expect(text).toContain("Prompt to paste into the Lovable chat");
    expect(text).toContain("Make the contact form send messages to my inbox using sendm8");
    expect(text).toContain("- Endpoint: https://sendm8.test/f/owner@mysite.dev");
    expect(text).toContain("Edge Function");
    expect(text).toContain("src/components/ContactForm.tsx");
  });

  it("makes the v0 component a client component", async () => {
    const text = textOf((await callTool("get_form_snippet", { email: "owner@mysite.dev", framework: "v0" })).body);
    expect(text).toContain('"use client";');
    expect(text).toContain("components/contact-form.tsx");
  });

  it.each([
    ["nextjs", true, '"use client";'],
    ["nextjs", false, "export default function ContactPage()"],
    ["react", false, 'action="https://sendm8.test/f/k3x9q2m7ab"'],
    ["astro", true, 'document.querySelector<HTMLFormElement>("#contact-form")!'],
    ["astro", false, "const endpoint = "],
    ["vue", true, '@submit.prevent="onSubmit"'],
    ["vue", false, "<template>"],
    ["svelte", true, "$state"],
    ["svelte", false, 'action="https://sendm8.test/f/k3x9q2m7ab"'],
    ["bolt", true, "Prompt to paste into the Bolt chat"],
  ])("returns %s code (ajax %s)", async (framework, ajax, expected) => {
    const { body } = await callTool("get_form_snippet", { formId: "K3X9Q2M7AB", framework, ajax });
    const text = textOf(body);
    expect(text).toContain(expected);
    expect(text).toContain("_gotcha");
    expect(text).toContain("no confirmation step");
  });

  it.each([
    [{ email: "not an email" }, "doesn't look like an email"],
    [{ email: 'x"@evil.com' }, "doesn't look like an email"],
    [{ formId: "short" }, "form id"],
    [{ email: "a@b.co", formId: "k3x9q2m7ab" }, "not both"],
    [{ framework: "angular" }, "framework must be one of"],
    [{ fields: ["<script>"] }, "Field names"],
    [{ fields: [] }, "fields must be"],
    [{ ajax: "yes" }, "ajax must be"],
    [{ email: 5 }, "email must be"],
    [{ formId: 5 }, "formId must be"],
  ])("refuses bad input %j as a tool error", async (args, message) => {
    const { body } = await callTool("get_form_snippet", args);
    expect(body.result.isError).toBe(true);
    expect(textOf(body)).toContain(message);
  });

  it("warns about addresses that can't receive submissions", async () => {
    expect(textOf((await callTool("get_form_snippet", { email: "me@site.test" })).body)).toContain("can't receive mail");
    expect(textOf((await callTool("get_form_snippet", { email: "me@mailinator.com" })).body)).toContain("anyone can read those inboxes");
  });

  it("returns the free plan limits", async () => {
    const { body } = await callTool("get_limits");
    const text = textOf(body);
    expect(text).toContain("Per form per month (signed-in owner): 1,000");
    expect(text).toContain("Instant notification emails per account per day: 10");
    expect(text).toContain("5 MB per file");
    expect(text).toContain("submissions per minute per IP per form");
  });

  it("returns a docs section, or a link when the built docs aren't there", async () => {
    const { body } = await callTool("get_docs", { topic: "fields" });
    const text = textOf(body);
    if (body.result.isError) expect(text).toContain("https://sendm8.test/docs/fields.md");
    else expect(text).toContain("_gotcha");
  });

  it("refuses an unknown docs topic", async () => {
    const { body } = await callTool("get_docs", { topic: "pricing" });
    expect(body.result.isError).toBe(true);
  });
});

describe("MCP: resources", () => {
  it("lists the docs as https resources", async () => {
    const { body } = await rpc("resources/list");
    const uris = (body.result.resources as { uri: string }[]).map((r) => r.uri);
    expect(uris).toContain("https://sendm8.test/llms.txt");
    expect(uris).toContain("https://sendm8.test/docs/basic-form.md");
  });

  it("returns resource not found for an unknown uri", async () => {
    const { body } = await rpc("resources/read", { uri: "https://evil.example/x" });
    expect(body.error!.code).toBe(-32002);
    const bad = await rpc("resources/read", { uri: 5 });
    expect(bad.body.error!.code).toBe(-32602);
  });

  it("reads a resource when the built docs exist", async () => {
    const { body } = await rpc("resources/read", { uri: "https://sendm8.test/docs/fields.md" });
    if (body.error) expect(body.error.code).toBe(-32002);
    else expect(body.result.contents[0].mimeType).toBe("text/markdown");
  });

  it("has no resource templates", async () => {
    expect((await rpc("resources/templates/list")).body.result.resourceTemplates).toEqual([]);
  });
});

describe("MCP: 2026-07-28 (stateless) requests", () => {
  it("answers server/discover with cache hints and server info", async () => {
    const { res, body } = await modern("server/discover");
    expect(res.status).toBe(200);
    expect(body.result).toMatchObject({ resultType: "complete", supportedVersions: ["2026-07-28"], cacheScope: "public" });
    expect(body.result.ttlMs).toBeGreaterThan(0);
    expect(body.result._meta["io.modelcontextprotocol/serverInfo"].name).toBe("sendm8");
    expect(body.result.instructions).toContain("get_form_snippet");
  });

  it("lists and calls tools", async () => {
    const list = await modern("tools/list");
    expect(list.body.result.resultType).toBe("complete");
    expect(list.body.result.ttlMs).toBeGreaterThan(0);
    expect(list.body.result.tools).toHaveLength(3);
    const call = await modern("tools/call", { name: "get_form_snippet", arguments: { email: "owner@mysite.dev", framework: "react" } });
    expect(call.body.result.resultType).toBe("complete");
    expect(textOf(call.body)).toContain("const ENDPOINT");
  });

  it("lists resources and refuses unknown ones with invalid params", async () => {
    expect((await modern("resources/list")).body.result.resources.length).toBeGreaterThan(1);
    expect((await modern("resources/templates/list")).body.result.resourceTemplates).toEqual([]);
    const missing = await modern("resources/read", { uri: "https://evil.example/x" });
    expect(missing.body.error!.code).toBe(-32602);
  });

  it("accepts a base64-encoded Mcp-Name", async () => {
    const { body } = await modern("tools/call", { name: "get_limits", arguments: {} }, { "mcp-name": `=?base64?${btoa("get_limits")}?=` });
    expect(body.result.resultType).toBe("complete");
  });

  it("returns 404 for an unknown method", async () => {
    const { res, body } = await modern("ping");
    expect(res.status).toBe(404);
    expect(body.error!.code).toBe(-32601);
  });

  it.each([
    ["a mismatched protocol header", { "mcp-protocol-version": "2025-06-18" }],
    ["a missing method header", { "mcp-method": "" }],
    ["a mismatched name header", { "mcp-name": "get_docs" }],
    ["a malformed base64 name header", { "mcp-name": "=?base64?!!!?=" }],
  ])("rejects %s with HeaderMismatch", async (_, headers) => {
    const { res, body } = await modern("tools/call", { name: "get_limits", arguments: {} }, headers);
    expect(res.status).toBe(400);
    expect(body.error!.code).toBe(-32020);
  });

  it("rejects an unsupported version in _meta", async () => {
    const res = await post(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { ...MODERN_META, "io.modelcontextprotocol/protocolVersion": "2099-01-01" } } },
      { "mcp-protocol-version": "2099-01-01", "mcp-method": "tools/list" },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Rpc;
    expect(body.error!.code).toBe(-32022);
    expect(body.error!.data.requested).toBe("2099-01-01");
  });

  it("rejects a modern request missing required _meta fields", async () => {
    const noMeta = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" });
    expect(noMeta.status).toBe(400);
    expect(((await noMeta.json()) as Rpc).error!.code).toBe(-32602);
    const noCaps = await post(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } },
      { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" },
    );
    expect(noCaps.status).toBe(400);
    expect(((await noCaps.json()) as Rpc).error!.code).toBe(-32602);
  });
});
