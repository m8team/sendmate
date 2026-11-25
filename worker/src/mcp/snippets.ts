/**
 * Contact form code for the MCP `get_form_snippet` tool. The wording, honeypot and fetch handling follow
 * the site's guides (web/src/config/guides/platforms.ts) and /llms.txt (web/src/lib/llms-docs.ts), so
 * an agent gets the same code a person would copy from the docs.
 */
import type { Limits } from "@sendm8/shared";

/** What the docs use when the owner's address isn't known yet. */
export const PLACEHOLDER_EMAIL = "you@example.com";

export const FRAMEWORKS = ["html", "react", "nextjs", "astro", "vue", "svelte", "lovable", "bolt", "v0"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

const BUILDERS: Partial<Record<Framework, { name: string; noBackend: string; file: string; useClient: boolean }>> = {
  lovable: {
    name: "Lovable",
    noBackend: "Don’t save submissions to a table, and don’t add a server function, Edge Function, Resend or any secret for this. The form posts straight from the browser.",
    file: "src/components/ContactForm.tsx",
    useClient: false,
  },
  bolt: {
    name: "Bolt",
    noBackend: "Don’t add a database table, server function, Resend or any secret for this. The form posts straight from the browser.",
    file: "src/components/ContactForm.tsx",
    useClient: false,
  },
  v0: {
    name: "v0",
    noBackend: 'Make it a client component ("use client"). Don’t add a Server Action, API route, Resend or environment variable for this.',
    file: "components/contact-form.tsx",
    useClient: true,
  },
};

type FieldKind = "email" | "textarea" | "tel" | "url" | "text";
interface Field {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
}

export interface SnippetInput {
  /** Already validated: an email address or a form id, safe to put in a URL, attribute or string literal. */
  target: string;
  isEmail: boolean;
  framework: Framework;
  fields: string[];
  ajax: boolean;
}

const HONEYPOT_HTML = `<input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">`;
const HONEYPOT_JSX = `<input type="text" name="_gotcha" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />`;
const HONEYPOT_XHTML = `<input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off" />`;
const THANKS = "Thanks! Your message is on its way.";
const RETRY = "Couldn't send, please try again.";

function toField(name: string): Field {
  const lower = name.toLowerCase();
  const kind: FieldKind = lower.includes("email")
    ? "email"
    : ["message", "comments", "comment", "details", "enquiry", "inquiry", "body", "notes"].includes(lower)
      ? "textarea"
      : ["phone", "tel", "telephone", "mobile"].includes(lower)
        ? "tel"
        : ["url", "website", "site"].includes(lower)
          ? "url"
          : "text";
  const words = name.replace(/[_.-]+/g, " ").trim();
  const label = lower === "email" ? "Your email" : words.charAt(0).toUpperCase() + words.slice(1);
  return { name, label, kind, required: kind === "email" || kind === "textarea" || lower === "name" };
}

/** One field as a labelled control. `jsx` switches to self-closing tags; `xhtml` self-closes without JSX props. */
function fieldMarkup(f: Field, style: "html" | "jsx" | "xhtml"): string {
  const req = f.required ? " required" : "";
  const close = style === "html" ? ">" : " />";
  if (f.kind === "textarea") {
    const area = style === "jsx" ? `<textarea name="${f.name}"${req} />` : `<textarea name="${f.name}"${req}></textarea>`;
    return `<label>${f.label} ${area}</label>`;
  }
  const type = f.kind === "text" ? "" : ` type="${f.kind}"`;
  return `<label>${f.label} <input name="${f.name}"${type}${req}${close}</label>`;
}

const indent = (text: string, pad: string) =>
  text
    .split("\n")
    .map((l) => (l ? pad + l : l))
    .join("\n");

function controls(fields: Field[], style: "html" | "jsx" | "xhtml", pad: string): string {
  const honeypot = style === "jsx" ? HONEYPOT_JSX : style === "xhtml" ? HONEYPOT_XHTML : HONEYPOT_HTML;
  const lines = [
    ...fields.map((f) => fieldMarkup(f, style)),
    style === "jsx" ? "{/* Honeypot: people never see it, bots fill it in */}" : "<!-- Honeypot: people never see it, bots fill it in -->",
    honeypot,
  ];
  return indent(lines.join("\n"), pad);
}

/** The React component from the AI-builder guides, with the requested fields. */
function reactComponent(endpoint: string, fields: Field[], useClient: boolean): string {
  return `${useClient ? '"use client";\n\n' : ""}import { useState, type FormEvent } from "react";

const ENDPOINT = "${endpoint}";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        body: new FormData(event.currentTarget),
        headers: { Accept: "application/json" },
      });
      const result = await res.json();
      if (result.ok) {
        setStatus("sent");
        return;
      }
      setError(result.error.message);
    } catch {
      setError("${RETRY}");
    }
    setStatus("idle");
  }

  if (status === "sent") return <p>${THANKS}</p>;

  return (
    <form onSubmit={onSubmit}>
${controls(fields, "jsx", "      ")}
      {error && <p role="alert">{error}</p>}
      <button disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send"}</button>
    </form>
  );
}`;
}

function reactPlain(endpoint: string, fields: Field[], exportLine: string): string {
  return `${exportLine} {
  return (
    <form action="${endpoint}" method="POST">
${controls(fields, "jsx", "      ")}
      <button>Send</button>
    </form>
  );
}`;
}

/** The fetch script for plain HTML and Astro. The form still posts normally if the script doesn't run. */
const fetchScript = (selector: string, ts: boolean) => `<script>
  const form = document.querySelector${ts ? "<HTMLFormElement>" : ""}("${selector}")${ts ? "!" : ""};
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button")${ts ? "!" : ""};
    button.disabled = true;
    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      const result = await res.json();
      if (result.ok) {
        form.replaceWith("${THANKS}");
        return;
      }
      alert(result.error.message);
    } catch {
      alert("${RETRY}");
    }
    button.disabled = false;
  });
</script>`;

function builderPrompt(endpoint: string, docsUrl: string, fields: Field[], noBackend: string): string {
  const names = fields.map((f) => f.name).join(", ");
  const emailField = fields.find((f) => f.kind === "email");
  const replyLine = emailField
    ? `\n  Keep the visitor's email field named "${emailField.name}" so my replies go to them.`
    : "";
  return `Make the contact form send messages to my inbox using sendm8, a free form backend.
Docs: ${docsUrl}

- Endpoint: ${endpoint}
  It needs no API key and no account. It isn't a secret, so don't store it as one.
- On submit, call preventDefault, then POST new FormData(form) to the endpoint with
  fetch and the header "Accept: application/json". Don't set Content-Type.
- Every input needs a name attribute: ${names}.${replyLine}
- Add a hidden honeypot field to the form:
  ${HONEYPOT_HTML}
- The response is JSON. If ok is true, replace the form with "${THANKS}"
  Otherwise show error.message from the response above the button.
  If fetch itself throws, show a short "Couldn't send, please try again" message.
- Disable the button while sending.
- ${noBackend}
- Keep the existing design, fields and copy.`;
}

interface Block {
  heading: string;
  lang: string;
  file?: string;
  code: string;
}

function blocksFor(input: SnippetInput, endpoint: string, docsUrl: string, fields: Field[]): Block[] {
  const { framework, ajax } = input;
  switch (framework) {
    case "html": {
      const form = `<form id="contact-form" action="${endpoint}" method="POST">\n${controls(fields, "html", "  ")}\n  <button>Send</button>\n</form>`;
      return [{ heading: ajax ? "HTML form with fetch" : "HTML form", lang: "html", file: "contact.html", code: ajax ? `${form}\n\n${fetchScript("#contact-form", false)}` : form }];
    }
    case "react":
      return ajax
        ? [{ heading: "React component", lang: "tsx", file: "src/components/ContactForm.tsx", code: reactComponent(endpoint, fields, false) }]
        : [{ heading: "React component (plain form post)", lang: "tsx", file: "src/components/ContactForm.tsx", code: reactPlain(endpoint, fields, "export function ContactForm()") }];
    case "nextjs":
      return ajax
        ? [{ heading: "Next.js client component", lang: "tsx", file: "app/contact/ContactForm.tsx", code: reactComponent(endpoint, fields, true) }]
        : [{ heading: "Next.js page (plain form post, works in a Server Component and with output: \"export\")", lang: "tsx", file: "app/contact/page.tsx", code: reactPlain(endpoint, fields, "export default function ContactPage()") }];
    case "astro": {
      const component = `---\nconst endpoint = "${endpoint}";\n---\n<form id="contact-form" action={endpoint} method="POST">\n${controls(fields, "xhtml", "  ")}\n  <button>Send</button>\n</form>`;
      return [{ heading: ajax ? "Astro component with fetch" : "Astro component", lang: "astro", file: "src/components/ContactForm.astro", code: ajax ? `${component}\n\n${fetchScript("#contact-form", true)}` : component }];
    }
    case "vue": {
      const code = ajax
        ? `<script setup lang="ts">
import { ref } from "vue";

const ENDPOINT = "${endpoint}";
const status = ref<"idle" | "sending" | "sent">("idle");
const error = ref("");

async function onSubmit(event: Event) {
  const form = event.currentTarget as HTMLFormElement;
  status.value = "sending";
  error.value = "";
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" },
    });
    const result = await res.json();
    if (result.ok) {
      status.value = "sent";
      return;
    }
    error.value = result.error.message;
  } catch {
    error.value = "${RETRY}";
  }
  status.value = "idle";
}
</script>

<template>
  <p v-if="status === 'sent'">${THANKS}</p>
  <form v-else @submit.prevent="onSubmit">
${controls(fields, "xhtml", "    ")}
    <p v-if="error" role="alert">{{ error }}</p>
    <button :disabled="status === 'sending'">{{ status === "sending" ? "Sending…" : "Send" }}</button>
  </form>
</template>`
        : `<template>\n  <form action="${endpoint}" method="POST">\n${controls(fields, "xhtml", "    ")}\n    <button>Send</button>\n  </form>\n</template>`;
      return [{ heading: ajax ? "Vue component (script setup)" : "Vue component", lang: "vue", file: "src/components/ContactForm.vue", code }];
    }
    case "svelte": {
      const code = ajax
        ? `<script lang="ts">
  const ENDPOINT = "${endpoint}";
  let status = $state<"idle" | "sending" | "sent">("idle");
  let error = $state("");

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    status = "sending";
    error = "";
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      const result = await res.json();
      if (result.ok) {
        status = "sent";
        return;
      }
      error = result.error.message;
    } catch {
      error = "${RETRY}";
    }
    status = "idle";
  }
</script>

{#if status === "sent"}
  <p>${THANKS}</p>
{:else}
  <form {onsubmit}>
${controls(fields, "xhtml", "    ")}
    {#if error}<p role="alert">{error}</p>{/if}
    <button disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send"}</button>
  </form>
{/if}`
        : `<form action="${endpoint}" method="POST">\n${controls(fields, "xhtml", "  ")}\n  <button>Send</button>\n</form>`;
      return [{ heading: ajax ? "Svelte 5 component" : "Svelte component", lang: "svelte", file: "src/lib/ContactForm.svelte", code }];
    }
    default: {
      const builder = BUILDERS[framework]!;
      return [
        { heading: `Prompt to paste into the ${builder.name} chat`, lang: "text", code: builderPrompt(endpoint, docsUrl, fields, builder.noBackend) },
        { heading: "What the component should come down to (check the AI's work against it)", lang: "tsx", file: builder.file, code: reactComponent(endpoint, fields, builder.useClient) },
      ];
    }
  }
}

export interface Snippet {
  endpoint: string;
  markdown: string;
}

export function buildSnippet(input: SnippetInput, origin: string, limits: Limits, warning?: string): Snippet {
  const endpoint = `${origin}/f/${input.target}`;
  const docsUrl = `${origin}/llms.txt`;
  const fields = input.fields.map(toField);
  const blocks = blocksFor(input, endpoint, docsUrl, fields);
  const builder = BUILDERS[input.framework];

  const notes: string[] = [];
  if (input.isEmail) {
    notes.push(
      `The first submission emails ${input.target} a one-time confirmation link. That message, and anything that arrives meanwhile, is stored and delivered once the link is clicked; after that, submissions arrive straight away. Until then a JSON success also has \`"pending": "confirmation"\`.`,
      `${input.target} must be the site owner's own address: it is where submissions are delivered. sendm8 is not an API for emailing other people (no receipts, invitations or password resets), and throwaway (yopmail, mailinator…) or reserved (example.com, *.test…) domains are refused.`,
      `Limits: a no-account endpoint keeps up to ${limits.submissionsPerUnclaimedFormPerMonth.toLocaleString("en-US")} submissions a month and delivers by email. Signing in at ${origin}/app with the same address moves the form into an account: ${limits.submissionsPerFormPerMonth.toLocaleString("en-US")} a month, a dashboard inbox, and Discord, Slack, Telegram or webhook delivery.`,
    );
  } else {
    notes.push(
      `Form ${input.target} was created in the dashboard (${origin}/app), so there is no confirmation step: submissions go to the notification targets its owner set up. If the form has allowed domains, add every address the site runs on (including previews), or posts get a 403.`,
      `Limits: ${limits.submissionsPerFormPerMonth.toLocaleString("en-US")} stored submissions per form per month, and ${limits.instantEmailsPerUserPerDay.toLocaleString("en-US")} instant notification emails per account per day (the rest go in a daily digest).`,
    );
  }
  notes.push(
    `Responses: send \`Accept: application/json\` to get \`{ "ok": true, "id": "…" }\` on success, or \`{ "ok": false, "error": { "code": "…", "message": "…" } }\` with a 4xx/5xx status. \`error.message\` is a plain-English sentence you can show as it is. Keep the \`_gotcha\` honeypot empty and hidden; it is how bots are caught.`,
  );
  if (builder) notes.push(`${builder.name} previews run inside a frame, where sendm8's thank-you page can't load, which is why the prompt uses fetch. If the app sets a Content-Security-Policy, allow ${origin} in connect-src.`);
  if (input.isEmail && input.target === PLACEHOLDER_EMAIL) {
    notes.unshift(`Replace ${PLACEHOLDER_EMAIL} with the site owner's own address before shipping. Ask the user for it if you don't know it.`);
  }
  if (warning) notes.unshift(warning);

  const code = blocks
    .map((b) => {
      const fence = b.code.includes("```") ? "````" : "```";
      return `### ${b.heading}${b.file ? `\n\n\`${b.file}\`` : ""}\n\n${fence}${b.lang === "text" ? "" : b.lang}\n${b.code}\n${fence}`;
    })
    .join("\n\n");

  const markdown = `## sendm8 contact form: ${input.framework}\n\nEndpoint: ${endpoint}\n\n${code}\n\n### Notes\n\n${notes.map((n) => `- ${n}`).join("\n")}\n\nFull docs: ${docsUrl}`;
  return { endpoint, markdown };
}
