/**
 * A small public MCP server at POST /mcp: Streamable HTTP with JSON responses, no auth, no sessions and
 * no user data. JSON-RPC is handled by hand to stay well inside the free plan's 10 ms CPU budget.
 *
 * It is dual-era (https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning):
 * - Legacy clients (2025-03-26, 2025-06-18, 2025-11-25) open with `initialize`. No session id is minted, so
 *   every later request stands alone, which those revisions allow.
 * - Modern clients (2026-07-28) send the protocol version in each request's `_meta` and in the
 *   MCP-Protocol-Version header, with Mcp-Method / Mcp-Name headers mirroring the body.
 */
import type { Context } from "hono";
import { createRouter, type AppEnv } from "../app";
import { hashIp } from "../lib/crypto";
import { clientIp } from "../lib/http";
import { captureError } from "../ops/errors";
import { callTool, isToolName, listResources, readResource, TOOLS } from "../mcp/tools";

export const MODERN_VERSIONS = ["2026-07-28"] as const;
/** Newest first: an `initialize` asking for a version not listed here is answered with the first. */
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
const SUPPORTED = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];

export const MAX_BODY_BYTES = 32 * 1024;
const SERVER_INFO = { name: "sendm8", title: "sendm8", version: "1.0.0" };
/** Tool and resource lists only change on deploy, so clients and caches may keep them for an hour. */
const LIST_TTL_MS = 3_600_000;

export const instructions = (origin: string) =>
  `sendm8 is a free, open-source form backend: a website's form posts to ${origin}/f/<owner email or form id> and each submission is emailed to the site owner, with no account, API key or server code. When the user wants a contact, feedback or enquiry form that sends them email (static sites, React, Next.js, Astro, Vue, Svelte, or apps built in Lovable, Bolt or v0), call get_form_snippet with the owner's own email address and their framework, and use the code it returns as is: it includes the _gotcha honeypot and JSON response handling. The address must be the site owner's, never a third party's; sendm8 delivers submissions to the form's owner and is not for emailing other people. The first submission sends the owner a one-time confirmation email. Use get_docs for details such as special fields, redirects, file uploads, spam protection and webhooks, and get_limits for the free plan's limits.`;

const CODE = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  headerMismatch: -32020,
  unsupportedVersion: -32022,
  /** Legacy (2025-11-25 and earlier) code for an unknown resource; modern versions use invalidParams. */
  legacyResourceNotFound: -32002,
  /** Application-defined, outside the JSON-RPC reserved range. */
  rateLimited: 429,
} as const;

type Id = string | number | null;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS, ...headers } });
}

const rpcError = (id: Id, code: number, message: string, status: number, data?: unknown) =>
  json({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined && { data }) } }, status);

const unsupportedVersion = (id: Id, requested: unknown) =>
  rpcError(id, CODE.unsupportedVersion, "Unsupported protocol version", 400, { supported: SUPPORTED, requested });

export const mcpRoutes = createRouter();

mcpRoutes.options("/", () => new Response(null, { status: 204, headers: CORS }));

mcpRoutes.post("/", handlePost);

// No standalone SSE stream and no sessions to delete.
mcpRoutes.all("/", () => new Response("This MCP endpoint accepts POST only.", { status: 405, headers: { allow: "POST, OPTIONS", ...CORS } }));

/** Reads at most MAX_BODY_BYTES, so an oversized or chunked body is refused without buffering it all. */
async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Decodes the `=?base64?…?=` form clients use for header values that aren't plain ASCII. */
function headerValue(value: string | null): string | null {
  if (value === null) return null;
  const match = value.match(/^=\?base64\?(.*)\?=$/);
  if (!match) return value;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(match[1]!), (ch) => ch.charCodeAt(0)));
  } catch {
    return null;
  }
}

async function handlePost(c: Context<AppEnv>): Promise<Response> {
  const env = c.env;
  const request = c.req.raw;

  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return rpcError(null, CODE.invalidRequest, "Send JSON-RPC with Content-Type: application/json.", 415);
  }

  const ipHash = await hashIp(env.IP_HASH_SECRET, clientIp(request));
  // Shares the submit-form binding (120 a minute per key); the mcp: prefix keeps the keys apart.
  const limited = await env.RL_SUBMIT_FORM?.limit({ key: `mcp:${ipHash ?? "unknown"}` });
  if (limited?.success === false) {
    const res = rpcError(null, CODE.rateLimited, "Too many requests. Try again in a minute.", 429);
    res.headers.set("retry-after", "60");
    return res;
  }

  const raw = await readBody(request);
  if (raw === null) return rpcError(null, CODE.invalidRequest, `Request body is larger than ${MAX_BODY_BYTES / 1024} KB.`, 413);

  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return rpcError(null, CODE.parseError, "Parse error: the body isn't valid JSON.", 400);
  }
  if (Array.isArray(message)) return rpcError(null, CODE.invalidRequest, "Batch requests aren't supported. Send one JSON-RPC message per request.", 400);
  if (!isObject(message) || message.jsonrpc !== "2.0") return rpcError(null, CODE.invalidRequest, 'Invalid request: expected a JSON-RPC 2.0 object with "jsonrpc": "2.0".', 400);

  const hasId = "id" in message;
  const id = message.id;
  if (hasId && !(typeof id === "string" || (typeof id === "number" && Number.isFinite(id)))) {
    return rpcError(null, CODE.invalidRequest, "Invalid request: id must be a string or a number.", 400);
  }

  // A response to a server request (this server never sends any) or a notification: accept and move on.
  if (typeof message.method !== "string") {
    if (hasId && ("result" in message || "error" in message)) return new Response(null, { status: 202, headers: CORS });
    return rpcError(hasId ? (id as Id) : null, CODE.invalidRequest, "Invalid request: method must be a string.", 400);
  }
  if (!hasId) return new Response(null, { status: 202, headers: CORS });

  const method = message.method;
  const params = message.params ?? {};
  if (!isObject(params)) return rpcError(id as Id, CODE.invalidParams, "params must be an object.", 400);

  try {
    return await dispatch(c, id as string | number, method, params);
  } catch (error) {
    c.executionCtx.waitUntil(captureError(env, error, { where: "mcp", method }));
    return rpcError(id as Id, CODE.internalError, "Something went wrong.", 500);
  }
}

async function dispatch(c: Context<AppEnv>, id: string | number, method: string, params: Record<string, unknown>): Promise<Response> {
  const headers = c.req.raw.headers;
  const meta = isObject(params._meta) ? params._meta : {};
  const metaVersion = meta["io.modelcontextprotocol/protocolVersion"];
  const headerVersion = headers.get("mcp-protocol-version");
  const origin = new URL(c.env.APP_URL || c.req.url).origin;
  const ctx = { env: c.env, origin };

  // ── Modern (2026-07-28): stateless, version in every request ──
  if (metaVersion !== undefined || (headerVersion !== null && (MODERN_VERSIONS as readonly string[]).includes(headerVersion))) {
    if (metaVersion === undefined) return rpcError(id, CODE.invalidParams, "Missing _meta[\"io.modelcontextprotocol/protocolVersion\"].", 400);
    if (typeof metaVersion !== "string" || !(MODERN_VERSIONS as readonly string[]).includes(metaVersion)) return unsupportedVersion(id, metaVersion);
    if (headerVersion !== metaVersion) return rpcError(id, CODE.headerMismatch, "Header mismatch: MCP-Protocol-Version must match the request's _meta protocol version.", 400);
    if (headers.get("mcp-method") !== method) return rpcError(id, CODE.headerMismatch, "Header mismatch: Mcp-Method must match the request's method.", 400);
    const named = method === "tools/call" ? params.name : method === "resources/read" ? params.uri : undefined;
    if (named !== undefined && headerValue(headers.get("mcp-name")) !== named) {
      return rpcError(id, CODE.headerMismatch, "Header mismatch: Mcp-Name must match the request's params.name or params.uri.", 400);
    }
    if (!isObject(meta["io.modelcontextprotocol/clientCapabilities"])) {
      return rpcError(id, CODE.invalidParams, "Missing _meta[\"io.modelcontextprotocol/clientCapabilities\"].", 400);
    }

    const done = (result: Record<string, unknown>, cacheable = false) =>
      json({
        jsonrpc: "2.0",
        id,
        result: { resultType: "complete", ...result, ...(cacheable && { ttlMs: LIST_TTL_MS, cacheScope: "public" }), _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO } },
      });

    switch (method) {
      case "server/discover":
        return done({ supportedVersions: [...MODERN_VERSIONS], capabilities: CAPABILITIES, instructions: instructions(origin) }, true);
      case "tools/list":
        return done({ tools: TOOLS }, true);
      case "resources/list":
        return done({ resources: listResources(origin) }, true);
      case "resources/templates/list":
        return done({ resourceTemplates: [] }, true);
      case "tools/call":
        return toolCall(id, params, ctx, (r) => done(r));
      case "resources/read":
        return resourceRead(id, params, ctx, CODE.invalidParams, (r) => done(r, true));
      default:
        return rpcError(id, CODE.methodNotFound, `Method not found: ${method}`, 404);
    }
  }

  // ── Legacy (2025-03-26 to 2025-11-25): initialize, then plain requests ──
  if (headerVersion !== null && !(LEGACY_VERSIONS as readonly string[]).includes(headerVersion)) return unsupportedVersion(id, headerVersion);
  const done = (result: Record<string, unknown>) => json({ jsonrpc: "2.0", id, result });

  switch (method) {
    case "initialize": {
      const requested = params.protocolVersion;
      const protocolVersion = (LEGACY_VERSIONS as readonly unknown[]).includes(requested) ? (requested as string) : LEGACY_VERSIONS[0];
      return done({ protocolVersion, capabilities: CAPABILITIES, serverInfo: SERVER_INFO, instructions: instructions(origin) });
    }
    case "ping":
      return done({});
    case "server/discover":
      return done({ supportedVersions: SUPPORTED, capabilities: CAPABILITIES, serverInfo: SERVER_INFO, instructions: instructions(origin) });
    case "tools/list":
      return done({ tools: TOOLS });
    case "resources/list":
      return done({ resources: listResources(origin) });
    case "resources/templates/list":
      return done({ resourceTemplates: [] });
    case "tools/call":
      return toolCall(id, params, ctx, done);
    case "resources/read":
      return resourceRead(id, params, ctx, CODE.legacyResourceNotFound, done);
    default:
      // Legacy clients read errors from the body, so a JSON-RPC error with 200 is what they expect.
      return rpcError(id, CODE.methodNotFound, `Method not found: ${method}`, 200);
  }
}

const CAPABILITIES = { tools: { listChanged: false }, resources: { listChanged: false } };

type Done = (result: Record<string, unknown>) => Response;

async function toolCall(id: string | number, params: Record<string, unknown>, ctx: Parameters<typeof callTool>[2], done: Done): Promise<Response> {
  const name = params.name;
  if (!isToolName(name)) {
    return rpcError(id, CODE.invalidParams, `Unknown tool: ${typeof name === "string" ? name : "(none)"}. Available: ${TOOLS.map((t) => t.name).join(", ")}.`, 200);
  }
  const args = params.arguments ?? {};
  if (!isObject(args)) return rpcError(id, CODE.invalidParams, "arguments must be an object.", 200);
  return done({ ...(await callTool(name, args, ctx)) });
}

async function resourceRead(
  id: string | number,
  params: Record<string, unknown>,
  ctx: Parameters<typeof readResource>[1],
  notFoundCode: number,
  done: Done,
): Promise<Response> {
  const uri = params.uri;
  if (typeof uri !== "string") return rpcError(id, CODE.invalidParams, "uri must be a string.", 200);
  const contents = await readResource(uri, ctx);
  if (!contents) return rpcError(id, notFoundCode, "Resource not found", 200, { uri });
  return done({ contents: [contents] });
}
