import { describe, expect, it } from "vitest";
import type { ParsedSubmission } from "../src/pipeline/parse";
import { assessSpam, disposableDomain, looksLikeGibberish, submitterEmail } from "../src/pipeline/spam";

const parsed = (fields: Record<string, string>, special: Record<string, string> = {}): ParsedSubmission => ({
  fields,
  special,
  droppedFiles: [],
  files: [],
});

/** A real person, in a browser, on a page. */
const browser = { referrer: "https://yourstudio.com/contact", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15" };
const real = { name: "Alex Moreno", email: "alex@moreno.dev", message: "Hiya! Loved the portfolio. Are you free for a quick project in October?" };

describe("disposable addresses", () => {
  it("spots throwaway providers, including subdomains", () => {
    expect(disposableDomain("bot@mailinator.com")).toBe("mailinator.com");
    expect(disposableDomain("BOT@Inbox.Mailinator.com")).toBe("mailinator.com");
    expect(disposableDomain("someone@yopmail.fr")).toBe("yopmail.fr");
    expect(disposableDomain("alex@moreno.dev")).toBeNull();
    // Not a trailing-substring match: a real company whose domain ends in the same letters.
    expect(disposableDomain("hi@nottempmail.com")).toBeNull();
    expect(disposableDomain(null)).toBeNull();
    expect(disposableDomain("nonsense")).toBeNull();
  });

  it("finds the submitter's address from _replyto or an email field", () => {
    expect(submitterEmail(parsed({ email: " Alex@Moreno.dev " }))).toBe("alex@moreno.dev");
    expect(submitterEmail(parsed({ email: "x@y.dev" }, { _replyto: "reply@moreno.dev" }))).toBe("reply@moreno.dev");
    expect(submitterEmail(parsed({ email: "not an address" }))).toBeNull();
    expect(submitterEmail(parsed({ message: "hi" }))).toBeNull();
  });
});

describe("gibberish", () => {
  it.each([
    ["asdkjhasdkjhasdkjh", true],
    ["asdfghjklqwertyuiop", true],
    ["Hjkl hjkl hjkl hjkl hjkl", true],
    ["ksjdfhgksjdfhgksjdfhgksjdfhg", true],
    // Real messages, in a few shapes.
    ["Hiya! Loved the portfolio. Are you free for a quick project in October?", false],
    ["Could you send over a quote for a five page marketing site, please?", false],
    ["Grüße aus Berlin, ich hätte gern ein Angebot für die Webseite.", false],
    ["こんにちは、お見積りをお願いできますか。", false],
    ["const handler = require('./handler'); module.exports = handler;", false],
    ["NASA JPL HTML CSS API SDK JSON HTTP", false],
    ["Thanks!", false],
    // Long real words, including a German compound, must survive.
    ["internationalisation", false],
    ["antidisestablishmentarianism", false],
    ["Rechtsschutzversicherung", false],
    ["counterrevolutionary", false],
    ["zxcvbnmzxcvbnmzxcvbnm", true],
  ])("%s → %s", (text, expected) => {
    expect(looksLikeGibberish(text)).toBe(expected);
  });
});

describe("scoring a submission", () => {
  it("leaves a real message from a browser at zero", () => {
    expect(assessSpam(parsed(real), {}, browser)).toMatchObject({ status: "ok", score: 0, reasons: [] });
  });

  it("nudges posts with no browser and no page, without ever calling them spam", () => {
    const verdict = assessSpam(parsed(real), {}, { userAgent: "WindowsPowerShell/5.1.26100.9444", referrer: null });
    expect(verdict).toMatchObject({ status: "ok", score: 0.15, reasons: ["no_browser"] });
    // An AJAX call from a page still counts as a browser.
    expect(assessSpam(parsed(real), {}, { ...browser, referrer: null }).score).toBe(0);
    expect(assessSpam(parsed(real), {}, { userAgent: null, referrer: "https://yourstudio.com/contact" }).score).toBe(0);
  });

  it("scores throwaway addresses and keyboard mash, but neither alone is spam", () => {
    const throwaway = assessSpam(parsed({ ...real, email: "bot@mailinator.com" }), {}, browser);
    expect(throwaway).toMatchObject({ status: "ok", score: 0.25, reasons: ["disposable_email:mailinator.com"] });

    const mash = assessSpam(parsed({ email: "alex@moreno.dev", message: "asdkjhasdkjhasdkjh" }), {}, browser);
    expect(mash).toMatchObject({ status: "ok", score: 0.3, reasons: ["gibberish"] });
  });

  it("adds up to spam when the signals pile on", () => {
    const verdict = assessSpam(
      parsed({
        email: "seo@guerrillamail.com",
        message: "Dear owner, our SEO agency builds backlinks. See https://a.test https://b.test https://c.test https://d.test",
      }),
      {},
      { userAgent: "python-requests/2.32", referrer: null },
    );
    expect(verdict.status).toBe("spam");
    expect(verdict.score).toBeGreaterThanOrEqual(0.8);
    expect(verdict.reasons).toEqual(expect.arrayContaining(["links:4", "phrases:2", "disposable_email:guerrillamail.com", "no_browser"]));
  });

  it("still drops honeypot hits and holds credential forms first", () => {
    expect(assessSpam(parsed(real, { _gotcha: "bot" }), {}, browser)).toMatchObject({ status: "spam", score: 1, drop: true });
    expect(assessSpam(parsed({ ...real, password: "hunter2" }), {}, browser)).toMatchObject({ status: "held", reasons: ["sensitive_field:password"] });
  });
});
