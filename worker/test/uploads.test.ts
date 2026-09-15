import type { SubmissionDto, Page } from "@sendm8/shared";
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLimits } from "../src/config";
import { cleanup } from "../src/cron";
import { storageUsage, submissions } from "../src/db/schema";
import { signFileToken, verifyFileToken } from "../src/files/storage";
import { SubmitError } from "../src/pipeline/errors";
import { parseSubmission } from "../src/pipeline/parse";
import {
  addChannel,
  addEmailChannel,
  addAddress,
  api,
  createForm,
  createUser,
  db,
  getSubmission,
  listSubmissions,
  mockFetch,
  signIn,
  waitFor,
} from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

function upload(formId: string, files: [field: string, name: string, content: string | Uint8Array, type?: string][], fields: Record<string, string> = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  for (const [field, name, content, type] of files) body.append(field, new File([content], name, { type: type ?? "text/plain" }));
  return SELF.fetch(`https://sendm8.test/f/${formId}`, { method: "POST", body, headers: { accept: "application/json" } });
}

const bytesFor = async (scope: string, scopeId: string) =>
  (await db().select().from(storageUsage).where(and(eq(storageUsage.scope, scope), eq(storageUsage.scopeId, scopeId))).get())?.bytes ?? 0;

describe("uploading", () => {
  it("stores files in R2, charges storage, and lets the owner download them safely", async () => {
    const session = await signIn();
    const form = await createForm({ userId: session.userId });
    const globalBefore = await bytesFor("global", "all");

    const res = await upload(form.id, [
      ["cv", "cv.pdf", "%PDF-1.4 fake", "application/pdf"],
      ["photo", "me.png", new Uint8Array([137, 80, 78, 71]), "image/png"],
    ], { name: "Ada" });
    expect(res.status).toBe(200);

    const [row] = await listSubmissions(form.id);
    expect(row?.meta.files).toHaveLength(2);
    expect(row?.meta.storageScope).toBe(`user:${session.userId}`);
    const stored = await env.FILES!.get(row!.meta.files![0]!.key);
    expect(await stored?.text()).toBe("%PDF-1.4 fake");
    expect(await bytesFor("user", session.userId)).toBe(17);
    // Other test files upload concurrently, so the platform-wide counter only has a lower bound here.
    expect((await bytesFor("global", "all")) - globalBefore).toBeGreaterThanOrEqual(17);

    const list = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions`, { headers: session.headers });
    const files = list.body.data[0]!.files;
    expect(files.map((f) => f.name)).toEqual(["cv.pdf", "me.png"]);
    expect(JSON.stringify(files)).not.toContain("f/");

    const pdf = await SELF.fetch(`https://sendm8.test${files[0]!.url}`, { headers: session.headers });
    expect(pdf.headers.get("content-type")).toBe("application/octet-stream");
    expect(pdf.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''cv.pdf");
    expect(pdf.headers.get("x-content-type-options")).toBe("nosniff");
    expect(pdf.headers.get("content-security-policy")).toContain("sandbox");
    expect(await pdf.text()).toBe("%PDF-1.4 fake");

    const png = await SELF.fetch(`https://sendm8.test${files[1]!.url}`, { headers: session.headers });
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(png.headers.get("content-disposition")).toMatch(/^inline/);

    // Other users can't download.
    const bob = await signIn();
    expect((await SELF.fetch(`https://sendm8.test${files[0]!.url}`, { headers: bob.headers })).status).toBe(404);
    expect((await SELF.fetch(`https://sendm8.test/api/submissions/${row!.id}/files/nope`, { headers: session.headers })).status).toBe(404);
  });

  it("serves HTML uploads as downloads, never rendered on our origin", async () => {
    const session = await signIn();
    const form = await createForm({ userId: session.userId });
    await upload(form.id, [["page", "evil.html", "<script>alert(document.cookie)</script>", "text/html"]]);
    const [row] = await listSubmissions(form.id);
    const res = await SELF.fetch(`https://sendm8.test/api/submissions/${row!.id}/files/${row!.meta.files![0]!.id}`, { headers: session.headers });
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
  });

  it("enforces per-file size and file count limits", async () => {
    const form = await createForm();
    const limits = getLimits(env);
    const big = await upload(form.id, [["f", "big.bin", new Uint8Array(limits.maxFileBytes + 1)]]);
    expect(big.status).toBe(413);
    expect(await big.json()).toMatchObject({ error: { code: "file_too_large" } });

    const many = await upload(
      form.id,
      Array.from({ length: limits.maxFilesPerSubmission + 1 }, (_, i) => [`f${i}`, `${i}.txt`, "x"] as [string, string, string]),
    );
    expect(await many.json()).toMatchObject({ error: { code: "too_many_files" } });
    expect(await listSubmissions(form.id)).toHaveLength(0);
  });

  it("keeps the message but drops files when the owner's storage is full", async () => {
    const owner = await createUser();
    const form = await createForm({ userId: owner.id });
    await db().insert(storageUsage).values({ scope: "user", scopeId: owner.id, bytes: getLimits(env).storagePerUserBytes - 2 });

    expect((await upload(form.id, [["cv", "cv.txt", "hello"]], { name: "Ada" })).status).toBe(200);
    const [row] = await listSubmissions(form.id);
    expect(row?.data).toEqual({ name: "Ada" });
    expect(row?.meta.files).toBeUndefined();
    expect(row?.meta.droppedFiles).toEqual(["cv"]);
  });

  it("doesn't store files for spam or held submissions", async () => {
    const form = await createForm();
    await upload(form.id, [["doc", "a.txt", "x"]], { password: "hunter2" });
    const [held] = await listSubmissions(form.id);
    expect(held?.status).toBe("held");
    expect(held?.meta.files).toBeUndefined();
    expect(held?.meta.droppedFiles).toEqual(["doc"]);
  });

  it("ignores files when uploads aren't enabled", async () => {
    const body = new FormData();
    body.append("name", "Ada");
    body.append("cv", new File(["x"], "cv.txt"));
    const request = new Request("https://x.test", { method: "POST", body });
    const parsed = await parseSubmission(request, getLimits(env), { uploads: false });
    expect(parsed.files).toEqual([]);
    expect(parsed.droppedFiles).toEqual(["cv"]);

    const tooBig = new Request("https://x.test", { method: "POST", body: new Uint8Array(70 * 1024), headers: { "content-type": "multipart/form-data; boundary=x" } });
    await expect(parseSubmission(tooBig, getLimits(env), { uploads: false })).rejects.toBeInstanceOf(SubmitError);
  });
});

describe("signed file links", () => {
  it("links files from notifications, and the links work without a session until they expire", async () => {
    const http = mockFetch();
    const owner = await createUser();
    const form = await createForm({ userId: owner.id });
    const address = await addAddress(owner.id, `${owner.id}@files.test`);
    await addEmailChannel(form.id, address.id);
    await addChannel(form.id, "webhook", { url: "https://hooks.example.com/files", secret: "whsec_f" });

    const res = await upload(form.id, [["cv", "cv.txt", "file body"]], { name: "Ada" });
    const { id } = await res.json<{ id: string }>();
    await waitFor(async () => ((await getSubmission(id))?.deliveries.length === 2 ? true : undefined));

    const email = http.emails().find((e) => e.to[0] === address.email);
    expect(email.html).toContain("Attachments");
    expect(email.text).toMatch(/cv\.txt \(1 KB\): https:\/\/sendm8\.test\/files\/[\w.-]+/);

    const hook = http.to("hooks.example.com")[0]!;
    const [file] = hook.body.submission.files;
    expect(file).toMatchObject({ field: "cv", name: "cv.txt", size: 9, type: "text/plain" });

    const download = await SELF.fetch(file.url);
    expect(await download.text()).toBe("file body");

    const token = new URL(file.url).pathname.split("/")[2]!;
    expect((await SELF.fetch(`https://sendm8.test/files/${token.slice(0, -2)}xx`)).status).toBe(404);
    expect((await SELF.fetch("https://sendm8.test/files/garbage")).status).toBe(404);
  });

  it("rejects expired and tampered tokens", async () => {
    const token = await signFileToken(env, "sub", "file", Date.now() + 60_000);
    expect(await verifyFileToken(env, token)).toEqual({ submissionId: "sub", fileId: "file" });
    expect(await verifyFileToken(env, token, Date.now() + 120_000)).toBeNull();

    const expired = await signFileToken(env, "sub", "file", Date.now() - 1);
    expect(await verifyFileToken(env, expired)).toBeNull();
    const [payload, signature] = token.split(".");
    expect(await verifyFileToken(env, `${payload}x.${signature}`)).toBeNull();
    expect(await verifyFileToken(env, "no-dot")).toBeNull();
  });

  it("stops serving files once the submission is held or the form disabled", async () => {
    const form = await createForm();
    const res = await upload(form.id, [["cv", "cv.txt", "x"]]);
    const { id } = await res.json<{ id: string }>();
    const row = (await getSubmission(id))!;
    const token = await signFileToken(env, id, row.meta.files![0]!.id, Date.now() + 60_000);
    expect((await SELF.fetch(`https://sendm8.test/files/${token}`)).status).toBe(200);

    await db().update(submissions).set({ status: "held" }).where(eq(submissions.id, id));
    expect((await SELF.fetch(`https://sendm8.test/files/${token}`)).status).toBe(404);
  });
});

describe("deleting frees storage", () => {
  async function uploaded() {
    const session = await signIn();
    const form = await createForm({ userId: session.userId });
    await upload(form.id, [["a", "a.txt", "12345"]]);
    await upload(form.id, [["b", "b.txt", "123"]]);
    const rows = await listSubmissions(form.id);
    return { session, form, rows };
  }

  it("on single and bulk delete", async () => {
    const { session, form, rows } = await uploaded();
    expect(await bytesFor("user", session.userId)).toBe(8);

    await api(`/submissions/${rows[0]!.id}`, { method: "DELETE", headers: session.headers });
    expect(await env.FILES!.get(rows[0]!.meta.files![0]!.key)).toBeNull();
    expect(await bytesFor("user", session.userId)).toBe(3);

    await api(`/forms/${form.id}/submissions/bulk`, { method: "POST", body: { ids: [rows[1]!.id], action: "delete" }, headers: session.headers });
    expect(await env.FILES!.get(rows[1]!.meta.files![0]!.key)).toBeNull();
    expect(await bytesFor("user", session.userId)).toBe(0);
  });

  it("on form delete", async () => {
    const { session, form, rows } = await uploaded();
    expect((await api(`/forms/${form.id}`, { method: "DELETE", headers: session.headers })).status).toBe(204);
    for (const row of rows) expect(await env.FILES!.get(row.meta.files![0]!.key)).toBeNull();
    expect(await bytesFor("user", session.userId)).toBe(0);
  });

  it("when old spam is cleaned up", async () => {
    const { session, rows } = await uploaded();
    await db().update(submissions).set({ status: "spam", createdAt: 0 }).where(eq(submissions.id, rows[0]!.id));
    await cleanup(env, Date.now());
    expect(await getSubmission(rows[0]!.id)).toBeUndefined();
    expect(await env.FILES!.get(rows[0]!.meta.files![0]!.key)).toBeNull();
    expect(await bytesFor("user", session.userId)).toBe(3);
  });
});

describe("dashboard shell and dev login", () => {
  it("serves the dashboard shell only for valid form ids", async () => {
    // web/dist may not be built in CI, so only assert the invalid-id case strictly.
    expect((await SELF.fetch("https://sendm8.test/app/forms/NOT-VALID")).status).toBe(404);
    const res = await SELF.fetch("https://sendm8.test/app/forms/abc1234567");
    expect([200, 404]).toContain(res.status);
  });

  it("keeps dev login disabled outside localhost", async () => {
    const res = await SELF.fetch("https://sendm8.test/api/dev/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(404);

    const { devLoginEnabled } = await import("../src/routes/dev");
    const local = "http://localhost:8787/api/dev/login";
    expect(devLoginEnabled({ APP_URL: "http://localhost:8787", DEV_LOGIN: "true" }, local)).toBe(true);
    expect(devLoginEnabled({ APP_URL: "http://127.0.0.1:8787", DEV_LOGIN: "true" }, "http://127.0.0.1:8787/api/dev/login")).toBe(true);
    expect(devLoginEnabled({ APP_URL: "https://sendm8.com", DEV_LOGIN: "true" }, local)).toBe(false);
    expect(devLoginEnabled({ APP_URL: "http://localhost.evil.com", DEV_LOGIN: "true" }, local)).toBe(false);
    expect(devLoginEnabled({ APP_URL: "http://localhost:8787", DEV_LOGIN: "1" }, local)).toBe(false);
    expect(devLoginEnabled({ APP_URL: "not a url", DEV_LOGIN: "true" }, local)).toBe(false);
    // A production Worker misconfigured with a localhost APP_URL still refuses real-world requests.
    expect(devLoginEnabled({ APP_URL: "http://localhost:8787", DEV_LOGIN: "true" }, "https://sendm8.workers.dev/api/dev/login")).toBe(false);
  });
});

