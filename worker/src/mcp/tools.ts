/**
 * The public MCP server's tools and resources. All of them are read-only and touch no user data: they
 * return code, docs and published limits, the same things anyone can read on the website.
 */
import type { Limits } from "@sendm8/shared";
import { getLimits } from "../config";
import { undeliverableDomain } from "../lib/email-address";
import { FORM_ID_PATTERN } from "../lib/ids";
import { disposableDomain } from "../pipeline/spam";
import { buildSnippet, FRAMEWORKS, PLACEHOLDER_EMAIL, type Framework } from "./snippets";

/**
 * The docs sections published as /docs/<id>.md by the web build. Keep in step with
 * web/src/components/docs/sections/docsSections.ts.
 */
export const DOCS_TOPICS = [
  { id: "basic-form", title: "The basic form" },
  { id: "zero-signup", title: "No signup: email in the URL" },
  { id: "fields", title: "Special fields" },
  { id: "ajax", title: "AJAX / fetch" },
  { id: "ajax-helper", title: "AJAX without writing JavaScript" },
  { id: "redirects", title: "Redirects & thank-you page" },
  { id: "spam", title: "Spam protection" },
  { id: "uploads", title: "File uploads" },
  { id: "discord", title: "Connect Discord" },
  { id: "byok", title: "Connect Resend (BYOK)" },
  { id: "webhooks", title: "Webhooks" },
  { id: "formspree", title: "Moving from Formspree" },
] as const;

const DEFAULT_FIELDS = ["name", "email", "message"];
const MAX_FIELDS = 20;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,49}$/;
/** Loose on purpose: the endpoint does the real checks. This only keeps the value safe to paste into code. */
const EMAIL = /^[^\s@"'`<>\\/?#{}$]+@[^\s@"'`<>\\/?#{}$]+\.[A-Za-z0-9-]{2,}$/;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const TOOLS = [
  {
    name: "get_form_snippet",
    title: "Get contact form code",
    description:
      "Returns working contact form code that posts to sendm8, a free form backend that emails each submission to the site owner. No account or API key needed. Use this whenever the user wants a contact, feedback or enquiry form that sends them email, on any static site, SPA or AI-built app. Pass the owner's own email address (or a sendm8 form id), the framework, and optionally the field names.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: `The site owner's own email address, where submissions should be delivered. Never a third party's. Defaults to ${PLACEHOLDER_EMAIL} as a placeholder.`,
          maxLength: 254,
        },
        formId: { type: "string", description: "A sendm8 form id from the dashboard (10 characters, e.g. k3x9q2m7ab). Use instead of email.", pattern: "^[0-9a-zA-Z]{10}$" },
        framework: { type: "string", enum: [...FRAMEWORKS], default: "html", description: "Where the form goes. lovable, bolt and v0 return a prompt for the builder's AI plus the component it should produce." },
        fields: {
          type: "array",
          items: { type: "string", pattern: FIELD_NAME.source },
          maxItems: MAX_FIELDS,
          description: `Field names to include, in order. Default: ${DEFAULT_FIELDS.join(", ")}. Keep the visitor's email field named "email" so replies go to them.`,
        },
        ajax: { type: "boolean", description: "Submit with fetch and show an inline message instead of a page change. Default: false for html, true for the frameworks." },
      },
      additionalProperties: false,
    },
    annotations: { title: "Get contact form code", ...READ_ONLY },
  },
  {
    name: "get_docs",
    title: "Read sendm8 docs",
    description: "Returns one section of the sendm8 docs as Markdown: special fields, AJAX responses and status codes, redirects, spam protection, uploads, webhooks, Discord, Resend BYOK, or moving from Formspree.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", enum: DOCS_TOPICS.map((t) => t.id), description: DOCS_TOPICS.map((t) => `${t.id}: ${t.title}`).join("; ") },
      },
      required: ["topic"],
      additionalProperties: false,
    },
    annotations: { title: "Read sendm8 docs", ...READ_ONLY },
  },
  {
    name: "get_limits",
    title: "Get free plan limits",
    description: "Returns sendm8's free plan limits as plain text: submissions per form per month, the no-account cap, instant emails per day, file sizes and rate limits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Get free plan limits", ...READ_ONLY },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];
export const isToolName = (name: unknown): name is ToolName => TOOLS.some((t) => t.name === name);

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const text = (value: string, isError = false): ToolResult => ({ content: [{ type: "text", text: value }], ...(isError && { isError }) });

export interface ToolContext {
  env: Env;
  /** The deployment's public origin, e.g. https://sendm8.com. */
  origin: string;
}

export async function callTool(name: ToolName, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case "get_form_snippet":
      return formSnippet(args, ctx);
    case "get_docs":
      return docs(args, ctx);
    case "get_limits":
      return text(limitsText(getLimits(ctx.env), ctx.origin));
  }
}

function formSnippet(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const { email, formId, framework = "html", fields, ajax } = args;
  if (email !== undefined && typeof email !== "string") return text("email must be a string.", true);
  if (formId !== undefined && typeof formId !== "string") return text("formId must be a string.", true);
  if (email && formId) return text("Pass either email or formId, not both.", true);
  if (typeof framework !== "string" || !(FRAMEWORKS as readonly string[]).includes(framework)) {
    return text(`framework must be one of: ${FRAMEWORKS.join(", ")}.`, true);
  }
  if (ajax !== undefined && typeof ajax !== "boolean") return text("ajax must be true or false.", true);

  let names = DEFAULT_FIELDS;
  if (fields !== undefined) {
    if (!Array.isArray(fields) || fields.length === 0 || fields.length > MAX_FIELDS) return text(`fields must be a list of 1 to ${MAX_FIELDS} field names.`, true);
    const bad = fields.find((f) => typeof f !== "string" || !FIELD_NAME.test(f));
    if (bad !== undefined) return text(`Field names start with a letter and use only letters, digits, _, . or - (got ${JSON.stringify(bad)}). The _gotcha honeypot is added for you.`, true);
    names = [...new Set(fields as string[])];
  }

  let target: string;
  let warning: string | undefined;
  if (formId) {
    target = formId.trim().toLowerCase();
    if (!FORM_ID_PATTERN.test(target)) return text("That doesn't look like a sendm8 form id: it's 10 letters and digits, like k3x9q2m7ab.", true);
  } else {
    target = (email ?? "").trim() || PLACEHOLDER_EMAIL;
    if (target.length > 254 || !EMAIL.test(target)) return text("That doesn't look like an email address. Pass the site owner's own address, like you@yourdomain.com.", true);
    if (target !== PLACEHOLDER_EMAIL) {
      const reserved = undeliverableDomain(target);
      const throwaway = disposableDomain(target);
      if (reserved) warning = `${reserved} can't receive mail, so this endpoint will refuse submissions. Use the owner's real address.`;
      else if (throwaway) warning = `Endpoints on ${throwaway} are refused because anyone can read those inboxes. Use the owner's real address.`;
    }
  }

  const snippet = buildSnippet(
    { target, isEmail: !formId, framework: framework as Framework, fields: names, ajax: ajax ?? (framework !== "html") },
    ctx.origin,
    getLimits(ctx.env),
    warning,
  );
  return text(snippet.markdown);
}

/** Reads a built Markdown file from the static assets. */
async function readAsset(env: Env, origin: string, path: string): Promise<string | null> {
  if (!env.ASSETS) return null;
  const res = await env.ASSETS.fetch(new Request(new URL(path, origin)));
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  // A missing file can come back as the HTML 404 page.
  if (type.includes("text/html")) return null;
  return res.text();
}

export const docsPath = (id: string) => `/docs/${id}.md`;

async function docs(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const topic = DOCS_TOPICS.find((t) => t.id === args.topic);
  if (!topic) return text(`topic must be one of: ${DOCS_TOPICS.map((t) => t.id).join(", ")}.`, true);
  const markdown = await readAsset(ctx.env, ctx.origin, docsPath(topic.id));
  if (markdown === null) return text(`The "${topic.title}" docs aren't available here right now. Read them at ${ctx.origin}${docsPath(topic.id)}.`, true);
  return text(markdown);
}

const n = (value: number) => value.toLocaleString("en-US");
const mb = (bytes: number) => `${n(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`;

export function limitsText(limits: Limits, origin: string): string {
  return `sendm8 free plan limits (everything is free; these are fair-use caps)

Submissions
- Per form per month (signed-in owner): ${n(limits.submissionsPerFormPerMonth)} stored submissions.
- Per no-account email endpoint (/f/you@example.com) per month: ${n(limits.submissionsPerUnclaimedFormPerMonth)}. Signing in with the same address lifts it to the per-form limit.
- New no-account endpoints per IP per day: ${n(limits.zeroSignupFormsPerIpPerDay)}.
- Forms per account: ${n(limits.maxFormsPerUser)}.

Notifications
- Instant notification emails per account per day: ${n(limits.instantEmailsPerUserPerDay)}. The rest go in a daily digest. Connect your own Resend key (BYOK) to send more.
- Discord, Slack, Telegram and webhook deliveries: unlimited.

Size
- Request body without files: ${n(limits.maxBodyBytes / 1024)} KB, up to ${n(limits.maxFields)} fields.
- File uploads: ${mb(limits.maxFileBytes)} per file, ${mb(limits.maxUploadBytes)} and ${n(limits.maxFilesPerSubmission)} files per submission.

Rate limits (approximate, per Cloudflare location)
- ${n(limits.burstPerIpPerFormPerMinute)} submissions per minute per IP per form.
- ${n(limits.burstPerFormPerMinute)} submissions per minute per form.

Spam is kept for ${n(limits.spamRetentionDays)} days before it's deleted.
Pricing and limits: ${origin}/pricing/`;
}

export const RESOURCES = [
  { uri: "llms.txt", name: "llms-txt", title: "sendm8 for AI assistants (llms.txt)", description: "What sendm8 is, the quickstart snippet, key facts and links to every docs section." },
  ...DOCS_TOPICS.map((t) => ({ uri: docsPath(t.id).slice(1), name: `docs-${t.id}`, title: `Docs: ${t.title}`, description: `The "${t.title}" section of the sendm8 docs.` })),
].map((r) => ({ ...r, mimeType: "text/markdown" }));

/** Resources are addressed by their public https URL, so the same URI works in a browser. */
export function listResources(origin: string) {
  return RESOURCES.map((r) => ({ ...r, uri: `${origin}/${r.uri}` }));
}

export async function readResource(uri: string, ctx: ToolContext): Promise<{ uri: string; mimeType: string; text: string } | null> {
  const known = RESOURCES.find((r) => `${ctx.origin}/${r.uri}` === uri);
  if (!known) return null;
  const body = await readAsset(ctx.env, ctx.origin, `/${known.uri}`);
  if (body === null) return null;
  return { uri, mimeType: known.mimeType, text: body };
}
