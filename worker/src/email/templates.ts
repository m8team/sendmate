import type { FieldValue } from "@sendm8/shared";
import { formatBytes } from "../channels/types";
import { escapeHtml } from "../lib/http";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const INK = "#141414";
const PAPER = "#f4efe6";
const MUTED = "#6b665e";
const SIGNAL = "#e8412c";
const RULE = "#d9d2c5";

/** Table-based, inline-styled layout that survives Outlook and Gmail. */
function layout(opts: { preheader: string; stampLabel: string; heading: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:2px solid ${INK};">
<tr><td style="padding:20px 28px;border-bottom:2px solid ${INK};font:700 18px/1 Arial,Helvetica,sans-serif;color:${INK};letter-spacing:-0.02em;">
sendm8
<span style="float:right;border:2px solid ${SIGNAL};color:${SIGNAL};padding:3px 8px;font:700 11px/1.2 'Courier New',monospace;letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(opts.stampLabel)}</span>
</td></tr>
<tr><td style="padding:28px 28px 8px;font:700 26px/1.15 Arial,Helvetica,sans-serif;color:${INK};letter-spacing:-0.02em;">${escapeHtml(opts.heading)}</td></tr>
<tr><td style="padding:8px 28px 28px;font:15px/1.55 Arial,Helvetica,sans-serif;color:${INK};">${opts.body}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid ${RULE};font:12px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">${opts.footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${INK};color:${PAPER};padding:12px 20px;font:700 14px/1 Arial,Helvetica,sans-serif;text-decoration:none;">${escapeHtml(label)}</a>`;
}

function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${MUTED};">${escapeHtml(label)}</a>`;
}

const valueText = (value: FieldValue) => (Array.isArray(value) ? value.join(", ") : value);

function fieldsTable(data: Record<string, FieldValue>): string {
  const rows = Object.entries(data)
    .map(
      ([name, value]) => `<tr>
<td style="padding:10px 12px 10px 0;border-top:1px solid ${RULE};vertical-align:top;width:32%;font:700 11px/1.5 'Courier New',monospace;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};word-break:break-word;">${escapeHtml(name)}</td>
<td style="padding:10px 0;border-top:1px solid ${RULE};vertical-align:top;font:15px/1.5 Arial,Helvetica,sans-serif;color:${INK};white-space:pre-wrap;word-break:break-word;">${escapeHtml(valueText(value)) || `<span style="color:${MUTED};">(empty)</span>`}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows || `<tr><td style="color:${MUTED};">No fields were submitted.</td></tr>`}</table>`;
}

function fieldsText(data: Record<string, FieldValue>): string {
  return Object.entries(data)
    .map(([name, value]) => `${name}:\n${valueText(value)}`)
    .join("\n\n");
}

/** Strips CR/LF so user-supplied subjects can't inject headers or break layout. */
const oneLine = (value: string, max = 150) => value.replace(/[\r\n]+/g, " ").trim().slice(0, max);

export function notificationEmail(opts: {
  formName: string;
  subject?: string;
  data: Record<string, FieldValue>;
  submittedAt: number;
  referrer: string | null;
  submissionUrl: string;
  settingsUrl: string;
  reportUrl: string;
  isTest?: boolean;
  files?: { name: string; size: number; url: string }[];
}): RenderedEmail {
  const subject = oneLine(opts.subject || `New submission: ${opts.formName}`);
  const when = new Date(opts.submittedAt).toUTCString();
  const from = opts.referrer ? ` from ${opts.referrer}` : "";
  const files = opts.files ?? [];
  const filesHtml = files.length
    ? `<p style="margin:20px 0 6px;font:700 11px/1.5 'Courier New',monospace;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Attachments</p>${files
        .map((f) => `<p style="margin:0 0 6px;">${link(f.url, f.name)} <span style="color:${MUTED};font-size:13px;">· ${formatBytes(f.size)}</span></p>`)
        .join("")}<p style="margin:0;color:${MUTED};font-size:12px;">Download links expire after a week. Files stay in your dashboard.</p>`
    : "";
  const filesText = files.length ? `\n\nAttachments:\n${files.map((f) => `- ${f.name} (${formatBytes(f.size)}): ${f.url}`).join("\n")}` : "";

  return {
    subject: opts.isTest ? `[Test] ${subject}` : subject,
    html: layout({
      preheader: `${opts.formName} got a new submission.`,
      stampLabel: opts.isTest ? "Test" : "Delivered",
      heading: `${opts.formName} has mail.`,
      body: `<p style="margin:0 0 20px;color:${MUTED};font-size:13px;">${escapeHtml(when)}${escapeHtml(from)}</p>
${fieldsTable(opts.data)}
${filesHtml}
<p style="margin:24px 0 0;">${button(opts.submissionUrl, "Open in sendm8")}</p>`,
      footer: `${link(opts.settingsUrl, "Notification settings")} · ${link(opts.reportUrl, "Report abuse")}`,
    }),
    text: `${opts.formName} has mail.\n${when}${from}\n\n${fieldsText(opts.data)}${filesText}\n\nOpen in sendm8: ${opts.submissionUrl}\nNotification settings: ${opts.settingsUrl}\nReport abuse: ${opts.reportUrl}\n`,
  };
}

export function zeroSignupConfirmEmail(opts: { email: string; site: string | null; waiting: number; confirmUrl: string; formEndpoint: string }): RenderedEmail {
  const from = opts.site ? ` on ${opts.site}` : "";
  const waiting = opts.waiting === 1 ? "1 message is" : `${opts.waiting} messages are`;
  return {
    subject: `Confirm form submissions${from}`,
    html: layout({
      preheader: `${waiting} waiting for you. Confirm to receive them.`,
      stampLabel: "Confirm",
      heading: "You've got mail waiting.",
      body: `<p style="margin:0 0 16px;">A form${escapeHtml(from)} is set up to send its submissions to <strong>${escapeHtml(opts.email)}</strong> using sendm8. ${escapeHtml(waiting)} waiting.</p>
<p style="margin:0 0 24px;">${button(opts.confirmUrl, "Confirm and deliver")}</p>
<p style="margin:0 0 12px;color:${MUTED};font-size:13px;">Not expecting this? Open the link and choose <strong>Not me</strong>. We'll stop the form and never email you about it again.</p>
<p style="margin:0;color:${MUTED};font-size:13px;">Tip: to keep your address out of your page source, use <span style="font-family:'Courier New',monospace;">${escapeHtml(opts.formEndpoint)}</span> as the form action instead.</p>`,
      footer: "You're receiving this once because a form submission named this address. The link expires in 24 hours.",
    }),
    text: `You've got mail waiting.\n\nA form${from} is set up to send its submissions to ${opts.email} using sendm8. ${waiting} waiting.\n\nConfirm (or say it's not you): ${opts.confirmUrl}\n\nTip: use ${opts.formEndpoint} as the form action to keep your address private.\n`,
  };
}

export function verificationEmail(opts: { email: string; verifyUrl: string }): RenderedEmail {
  return {
    subject: "Confirm your email for sendm8",
    html: layout({
      preheader: "One click and your form notifications can start arriving.",
      stampLabel: "Confirm",
      heading: "Is this you, mate?",
      body: `<p style="margin:0 0 20px;">Someone (hopefully you) asked for sendm8 form notifications to be sent to <strong>${escapeHtml(opts.email)}</strong>.</p>
<p style="margin:0 0 24px;">${button(opts.verifyUrl, "Yep, that's me")}</p>
<p style="margin:0;color:${MUTED};font-size:13px;">This link expires in 24 hours. If this wasn't you, ignore this email and nothing will be sent.</p>`,
      footer: "You're receiving this because this address was added to a sendm8 account.",
    }),
    text: `Is this you, mate?\n\nSomeone asked for sendm8 form notifications to be sent to ${opts.email}.\n\nConfirm: ${opts.verifyUrl}\n\nThis link expires in 24 hours. If this wasn't you, ignore this email.\n`,
  };
}

export interface DigestGroup {
  formName: string;
  total: number;
  submissions: { data: Record<string, FieldValue>; submittedAt: number; url: string }[];
}

export function digestEmail(opts: { groups: DigestGroup[]; settingsUrl: string }): RenderedEmail {
  const total = opts.groups.reduce((sum, g) => sum + g.total, 0);
  const noun = total === 1 ? "submission" : "submissions";

  const summary = (data: Record<string, FieldValue>) => {
    const entries = Object.entries(data).slice(0, 3);
    return entries.map(([k, v]) => `${k}: ${oneLine(valueText(v), 80)}`).join(" · ") || "(no fields)";
  };

  const html = opts.groups
    .map((group) => {
      const items = group.submissions
        .map(
          (s) => `<tr><td style="padding:10px 0;border-top:1px solid ${RULE};font:14px/1.5 Arial,Helvetica,sans-serif;">
<a href="${escapeHtml(s.url)}" style="color:${INK};text-decoration:none;">${escapeHtml(summary(s.data))}</a>
<div style="font:11px/1.5 'Courier New',monospace;color:${MUTED};">${escapeHtml(new Date(s.submittedAt).toUTCString())}</div>
</td></tr>`,
        )
        .join("");
      const more = group.total - group.submissions.length;
      return `<h2 style="margin:24px 0 4px;font:700 17px/1.3 Arial,Helvetica,sans-serif;">${escapeHtml(group.formName)} <span style="color:${MUTED};font-weight:400;">(${group.total})</span></h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
${more > 0 ? `<p style="margin:8px 0 0;color:${MUTED};font-size:13px;">…and ${more} more in your dashboard.</p>` : ""}`;
    })
    .join("");

  const text = opts.groups
    .map((g) => `${g.formName} (${g.total})\n${g.submissions.map((s) => `- ${summary(s.data)}\n  ${s.url}`).join("\n")}`)
    .join("\n\n");

  return {
    subject: `Your sendm8 digest: ${total} new ${noun}`,
    html: layout({
      preheader: `${total} new ${noun} today.`,
      stampLabel: "Digest",
      heading: `${total} new ${noun}.`,
      body: `<p style="margin:0;color:${MUTED};">Here's what came in since your last digest.</p>${html}`,
      footer: `Want these instantly? Add your own Resend key for unlimited instant emails. ${link(opts.settingsUrl, "Email settings")}`,
    }),
    text: `${total} new ${noun}.\n\n${text}\n\nEmail settings: ${opts.settingsUrl}\n`,
  };
}
