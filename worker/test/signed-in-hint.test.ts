import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { HINT_COOKIE, clearHintCookie, hasHint, hasSessionCookie, hintCookie, safeNext, sessionCookieChange, syncHint } from "../src/lib/signed-in-hint";
import { signIn } from "./helpers";

const hintFrom = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith(`${HINT_COOKIE}=`));

describe("signed-in marker cookie", () => {
  it("is readable, follows the session's lifetime and is secure on https", () => {
    expect(hintCookie("https://sendm8.com/api/me", 604800)).toBe("sendm8_signed_in=1; Path=/; SameSite=Lax; Max-Age=604800; Secure");
    expect(hintCookie("http://localhost:8787/api/me")).toBe("sendm8_signed_in=1; Path=/; SameSite=Lax");
    expect(clearHintCookie("https://sendm8.com/")).toContain("Max-Age=0");
    expect(hintCookie("https://x/")).not.toMatch(/HttpOnly/i);
  });

  it("reads the cookies a request carries", () => {
    expect(hasHint("a=1; sendm8_signed_in=1")).toBe(true);
    expect(hasHint("sendm8_signed_in=")).toBe(false);
    expect(hasSessionCookie("__Secure-sendm8.session_token=abc.sig")).toBe(true);
    expect(hasSessionCookie("x=1; sendm8.session_token=abc")).toBe(true);
    expect(hasSessionCookie("sendm8.session_token=")).toBe(false);
    expect(hasSessionCookie("sendm8.session_data=abc")).toBe(false);
    expect(hasSessionCookie(null)).toBe(false);
  });

  it("works out what a session Set-Cookie means", () => {
    const now = Date.UTC(2026, 10, 23);
    expect(sessionCookieChange("__Secure-sendm8.session_token=abc; Max-Age=604800; Path=/; HttpOnly")).toEqual({ action: "set", maxAge: 604800 });
    expect(sessionCookieChange("sendm8.session_token=; Max-Age=0; Path=/")).toEqual({ action: "clear" });
    expect(sessionCookieChange("sendm8.session_token=abc; Max-Age=0")).toEqual({ action: "clear" });
    expect(sessionCookieChange(`sendm8.session_token=abc; Expires=${new Date(now + 60_000).toUTCString()}`, now)).toEqual({ action: "set", maxAge: 60 });
    expect(sessionCookieChange(`sendm8.session_token=abc; Expires=${new Date(now - 60_000).toUTCString()}`, now)).toEqual({ action: "clear" });
    expect(sessionCookieChange("sendm8.session_token=abc; Path=/")).toEqual({ action: "set" });
    expect(sessionCookieChange("sendm8.session_data=abc; Max-Age=300")).toBeNull();
  });

  it("mirrors sign-in and sign-out responses", () => {
    const req = new Request("https://sendm8.com/api/auth/callback/github");
    const signedIn = new Response(null, { status: 302, headers: { "set-cookie": "__Secure-sendm8.session_token=abc; Max-Age=604800; Path=/; HttpOnly; Secure" } });
    expect(hintFrom(syncHint(req, signedIn))).toBe("sendm8_signed_in=1; Path=/; SameSite=Lax; Max-Age=604800; Secure");

    const signedOut = new Response("{}", { headers: { "set-cookie": "__Secure-sendm8.session_token=; Max-Age=0; Path=/" } });
    expect(hintFrom(syncHint(req, signedOut))).toContain("Max-Age=0");

    const plain = new Response("{}");
    expect(syncHint(req, plain)).toBe(plain);
  });
});

describe("safeNext", () => {
  it("only allows dashboard paths", () => {
    expect(safeNext(null)).toBe("/app");
    expect(safeNext("/app/forms/abc1234567?folder=spam")).toBe("/app/forms/abc1234567?folder=spam");
    expect(safeNext("https://evil.example/app")).toBe("/app");
    expect(safeNext("//evil.example/app")).toBe("/app");
    expect(safeNext("/app\\evil")).toBe("/app");
    expect(safeNext("/pricing")).toBe("/app");
    expect(safeNext("/app/sign-in/")).toBe("/app");
  });
});

describe("/api/me and the marker", () => {
  it("sets the marker for a session that doesn't have one yet, until the session expires", async () => {
    const { headers } = await signIn();
    const res = await SELF.fetch("https://sendm8.test/api/me", { headers });
    expect(res.status).toBe(200);
    const cookie = hintFrom(res)!;
    expect(cookie).toMatch(/^sendm8_signed_in=1; Path=\/; SameSite=Lax; Max-Age=\d+; Secure$/);
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)![1]);
    // Better Auth may extend the session as it's used; the marker follows whatever the expiry is now.
    expect(maxAge).toBeGreaterThan(86_000);
    expect(maxAge).toBeLessThanOrEqual(7 * 86_400);
  });

  it("leaves an existing marker alone", async () => {
    const { headers } = await signIn();
    const res = await SELF.fetch("https://sendm8.test/api/me", { headers: { ...headers, cookie: `${headers.cookie}; sendm8_signed_in=1` } });
    expect(hintFrom(res)).toBeUndefined();
  });

  it("clears a marker when the session has gone", async () => {
    const res = await SELF.fetch("https://sendm8.test/api/me", { headers: { cookie: "sendm8_signed_in=1" } });
    expect(res.status).toBe(401);
    expect(hintFrom(res)).toContain("Max-Age=0");
  });
});

describe("/app/sign-in", () => {
  it("sends a signed-in visitor straight to the dashboard", async () => {
    const { headers } = await signIn();
    const res = await SELF.fetch("https://sendm8.test/app/sign-in", { headers, redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("works with a trailing slash too", async () => {
    const { headers } = await signIn();
    const res = await SELF.fetch("https://sendm8.test/app/sign-in/", { headers, redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app");
  });

  it("honours a safe ?next and ignores an unsafe one", async () => {
    const { headers } = await signIn();
    const to = async (next: string) =>
      (await SELF.fetch(`https://sendm8.test/app/sign-in?next=${encodeURIComponent(next)}`, { headers, redirect: "manual" })).headers.get("location");
    expect(await to("/app/forms/abc1234567")).toBe("/app/forms/abc1234567");
    expect(await to("https://evil.example/")).toBe("/app");
  });

  it("shows the page to signed-out visitors, and drops a stale marker", async () => {
    const plain = await SELF.fetch("https://sendm8.test/app/sign-in", { redirect: "manual" });
    expect(plain.status).not.toBe(302);
    expect(hintFrom(plain)).toBeUndefined();

    const stale = await SELF.fetch("https://sendm8.test/app/sign-in", {
      redirect: "manual",
      headers: { cookie: "__Secure-sendm8.session_token=nope.bad; sendm8_signed_in=1" },
    });
    expect(stale.status).not.toBe(302);
    expect(hintFrom(stale)).toContain("Max-Age=0");
  });
});

describe("sign-out", () => {
  it("clears the marker along with the session", async () => {
    const { headers } = await signIn();
    const res = await SELF.fetch("https://sendm8.test/api/auth/sign-out", {
      method: "POST",
      headers: { ...headers, cookie: `${headers.cookie}; sendm8_signed_in=1`, "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => /session_token=;/.test(c))).toBe(true);
    expect(hintFrom(res)).toContain("Max-Age=0");
  });
});
