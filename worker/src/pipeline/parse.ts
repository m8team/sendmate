import type { FieldValue, Limits } from "@sendm8/shared";
import type { IncomingFile } from "../files/storage";
import { SubmitError } from "./errors";

export interface ParsedSubmission {
  /** Submitted fields, minus special/underscore fields. */
  fields: Record<string, FieldValue>;
  /** Special fields (`_subject`, `_next`, `_gotcha`…) and captcha tokens. First value wins. */
  special: Record<string, string>;
  /** Names of file inputs we ignored. */
  droppedFiles: string[];
  /** Uploaded files, when uploads are enabled. */
  files: IncomingFile[];
}

/** Captcha tokens are consumed, never stored. */
const TOKEN_FIELDS = new Set(["cf-turnstile-response", "g-recaptcha-response", "h-captcha-response"]);

const encoder = new TextEncoder();

async function readLimited(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw tooLarge(maxBytes);
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024)} MB` : `${Math.round(bytes / 1024)} KB`);

function tooLarge(maxBytes: number) {
  return new SubmitError(413, "payload_too_large", `Submissions are limited to ${size(maxBytes)}.`);
}

class FieldCollector {
  readonly fields: Record<string, FieldValue> = {};
  readonly special: Record<string, string> = {};
  readonly droppedFiles: string[] = [];
  readonly files: IncomingFile[] = [];
  private count = 0;

  constructor(private readonly limits: Limits) {}

  add(rawName: string, value: string) {
    const name = rawName.trim().replace(/\[\]$/, "");
    if (!name) return;
    if (name.length > this.limits.maxFieldNameLength) {
      throw new SubmitError(400, "field_name_too_long", `Field names are limited to ${this.limits.maxFieldNameLength} characters.`);
    }
    if (encoder.encode(value).byteLength > this.limits.maxFieldValueBytes) {
      throw new SubmitError(
        413,
        "field_too_large",
        `The field "${name}" is too long (max ${Math.round(this.limits.maxFieldValueBytes / 1024)} KB).`,
      );
    }

    if (name.startsWith("_") || TOKEN_FIELDS.has(name)) {
      if (!(name in this.special)) this.special[name] = value;
      return;
    }

    const existing = this.fields[name];
    if (existing === undefined) {
      if (++this.count > this.limits.maxFields) {
        throw new SubmitError(400, "too_many_fields", `Forms are limited to ${this.limits.maxFields} fields.`);
      }
      this.fields[name] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      this.fields[name] = [existing, value];
    }
  }

  result(): ParsedSubmission {
    return { fields: this.fields, special: this.special, droppedFiles: this.droppedFiles, files: this.files };
  }
}

function jsonValueToStrings(value: unknown): string | string[] {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "")));
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function parseSubmission(request: Request, limits: Limits, opts: { uploads?: boolean } = {}): Promise<ParsedSubmission> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const multipartUploads = Boolean(opts.uploads) && contentType.includes("multipart/form-data");
  const body = await readLimited(request, multipartUploads ? limits.maxUploadBytes : limits.maxBodyBytes);
  const collector = new FieldCollector(limits);

  if (contentType.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new SubmitError(400, "invalid_json", "The request body isn't valid JSON.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new SubmitError(400, "invalid_json", "Send a JSON object of field names to values.");
    }
    for (const [name, value] of Object.entries(parsed)) {
      const normalised = jsonValueToStrings(value);
      for (const v of Array.isArray(normalised) ? normalised : [normalised]) collector.add(name, v);
    }
    return collector.result();
  }

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await new Request("https://parse.invalid", {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type")! },
        body,
      }).formData();
    } catch {
      throw new SubmitError(400, "invalid_body", "The multipart form body couldn't be read.");
    }
    for (const [name, value] of formData.entries()) {
      if (typeof value === "string") collector.add(name, value);
      else if (value.size === 0 && !value.name) continue;
      else if (!multipartUploads) collector.droppedFiles.push(name);
      else {
        if (value.size > limits.maxFileBytes) {
          throw new SubmitError(413, "file_too_large", `"${value.name}" is too big. Files are limited to ${size(limits.maxFileBytes)}.`);
        }
        if (collector.files.length >= limits.maxFilesPerSubmission) {
          throw new SubmitError(413, "too_many_files", `Submissions are limited to ${limits.maxFilesPerSubmission} files.`);
        }
        collector.files.push({ field: name.trim().replace(/[]$/, ""), file: value });
      }
    }
    return collector.result();
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("text/plain") || contentType === "") {
    for (const [name, value] of new URLSearchParams(new TextDecoder().decode(body))) collector.add(name, value);
    return collector.result();
  }

  throw new SubmitError(415, "unsupported_media_type", "Send form data, multipart form data, or JSON.");
}
