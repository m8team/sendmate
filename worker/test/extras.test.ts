import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "../src/auth";
import { discordBody } from "../src/channels/discord";
import { slackBody } from "../src/channels/slack";
import { telegramText } from "../src/channels/telegram";
import type { Notification } from "../src/channels/types";
import { forms } from "../src/db/schema";
import worker from "../src/index";
import { ensureAppUrl, emailFrom } from "../src/lib/app-url";
import { instanceSettings } from "../src/db/schema";
import { createUser, db, mockFetch, postJson } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

const localEnv = () => ({ ...env, APP_URL: "http://localhost:8787", DEV_LOGIN: "true" }) as Env;
const ctx = () => ({ waitUntil: () => {}, passThroughOnException: () => {}, props: {} }) as unknown as ExecutionContext;

describe("dev login (localhost only)", () => {
  it("signs in with a working session cookie", async () => {
    const local = localEnv();
    const login = await worker.fetch(
      new Request("http://localhost:8787/api/dev/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "Dev.Person@Local.test" }) }),
      local,
      ctx(),
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^sendm8\.session_token=/);
    expect(cookie).toContain("HttpOnly");

    const me = await worker.fetch(new Request("http://localhost:8787/api/me", { headers: { cookie: cookie.split(";")[0]! } }), local, ctx());
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ data: { user: { email: "dev.person@local.test" } } });

    // Signing in again reuses the same user.
    const again = await worker.fetch(
      new Request("http://localhost:8787/api/dev/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "dev.person@local.test" }) }),
      local,
      ctx(),
    );
    const first = (await login.clone().json()) as { data: { userId: string } };
    expect(((await again.json()) as { data: { userId: string } }).data.userId).toBe(first.data.userId);
  });
});

describe("sign-in hook", () => {
  it("claims zero-signup forms when a session is created, without ever failing sign-in", async () => {
    mockFetch();
    const email = `hook${Date.now()}@zero.test`;
    await postJson(email, { a: "b" });
    const owner = await createUser({ email });

    const hooks = getAuth(env).options.databaseHooks!.session!.create!.after!;
    await hooks({ userId: owner.id } as never);
    expect((await db().select().from(forms).where(eq(forms.ownerEmail, email)).get())?.userId).toBe(owner.id);

    // A missing user (or any error) is swallowed.
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(hooks({ userId: "ghost" } as never)).resolves.toBeUndefined();
  });
});

describe("attachments in chat messages", () => {
  const n: Notification = {
    formId: "abc1234567",
    formName: "Jobs",
    submissionId: "01sub",
    createdAt: 0,
    data: { name: "Ada" },
    subject: null,
    replyTo: null,
    referrer: null,
    country: null,
    submissionUrl: "https://sendm8.test/app/forms/abc1234567?submission=01sub",
    isTest: false,
    files: [{ field: "cv", name: "cv [final].pdf", size: 2_500_000, type: "application/pdf", url: "https://sendm8.test/files/tok" }],
  };

  it("lists files with signed links", () => {
    const embed = discordBody(n).embeds[0]!;
    expect(embed.fields.at(-1)).toEqual({ name: "Attachments", value: "[cv final.pdf](https://sendm8.test/files/tok) · 2.4 MB", inline: false });

    const slack = slackBody(n).blocks.map((b: any) => b.text?.text).filter(Boolean);
    expect(slack).toContain("*Attachments*\n<https://sendm8.test/files/tok|cv [final].pdf> · 2.4 MB");

    expect(telegramText(n)).toContain('📎 <a href="https://sendm8.test/files/tok">cv [final].pdf</a> · 2.4 MB');
  });
});

describe("zero-config deploys", () => {
  it("adopts the first visited URL as APP_URL, saves it for cron jobs, and never overwrites it", async () => {
    await db().delete(instanceSettings);
    const fresh = { ...env, APP_URL: "" } as Env;
    await ensureAppUrl(fresh, new Request("https://sendm8-fork.alice.workers.dev/health"));
    expect(fresh.APP_URL).toBe("https://sendm8-fork.alice.workers.dev");

    const cron = { ...env, APP_URL: "" } as Env;
    await ensureAppUrl(cron);
    expect(cron.APP_URL).toBe("https://sendm8-fork.alice.workers.dev");

    const later = { ...env, APP_URL: "" } as Env;
    await ensureAppUrl(later, new Request("https://some-other-host.example/"));
    expect(later.APP_URL).toBe("https://sendm8-fork.alice.workers.dev");

    const configured = { ...env, APP_URL: "https://forms.example.com" } as Env;
    await ensureAppUrl(configured, new Request("https://ignored.example/"));
    expect(configured.APP_URL).toBe("https://forms.example.com");
    await db().delete(instanceSettings);
  });

  it("serves requests end to end without APP_URL", async () => {
    await db().delete(instanceSettings);
    const res = await worker.fetch(new Request("https://fresh.example.workers.dev/health"), { ...env, APP_URL: "" } as Env, ctx());
    expect(res.status).toBe(200);
    await db().delete(instanceSettings);
  });

  it("falls back to notify@<host> when EMAIL_FROM isn't set", () => {
    expect(emailFrom({ EMAIL_FROM: "", APP_URL: "https://forms.example.com" })).toBe("sendm8 <notify@forms.example.com>");
    expect(emailFrom({ EMAIL_FROM: "Me <me@x.dev>", APP_URL: "https://forms.example.com" })).toBe("Me <me@x.dev>");
    expect(emailFrom({ EMAIL_FROM: "", APP_URL: "" })).toBe("sendm8 <notify@localhost>");
  });
});
