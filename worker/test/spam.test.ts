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
    // The domain a prober used, which the list missed, and the rest of that provider's family.
    expect(disposableDomain("x@guerrillamailblock.com")).toBe("guerrillamailblock.com");
    expect(disposableDomain("x@guerrillamail.net")).toBe("guerrillamail.net");
    expect(disposableDomain("x@mail.tm")).toBe("mail.tm");
    // Provider names as a label's start catch domains the list has never seen.
    expect(disposableDomain("x@guerrillamail-new.xyz")).toBe("guerrillamail-new.xyz");
    expect(disposableDomain("x@tempmail.dev")).toBe("tempmail.dev");
    expect(disposableDomain("x@inbox.mailinator-new.org")).toBe("inbox.mailinator-new.org");
    // ...but not businesses that merely resemble them.
    for (const fine of ["a@templatemail.com", "a@mailchimp.com", "a@gmail.com", "a@tempo.io", "a@guerrilla-marketing.co"]) expect(disposableDomain(fine), fine).toBeNull();
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

describe("marketplace phishing", () => {
  const lure =
    "Hi there! Good news: Order #VT-748292 sold and is paid, with funds safely reserved in your pending balance. We just need a quick profile check before releasing your shipping label. Complete it here: http://a29.at/";

  it("bins the sold-and-paid lure when it names a marketplace or poses as one in the reply-to", () => {
    expect(assessSpam(parsed({ message: `Vinted: ${lure}` }), {}, browser)).toMatchObject({ status: "spam", reasons: ["marketplace_phish"] });
    const posing = assessSpam(parsed({ email: "sender@example.com", message: lure }, { _replyto: "notify@poshmark.com" }), {}, browser);
    expect(posing.status).toBe("spam");
    expect(posing.reasons).toContain("marketplace_phish");
    // Some copies name no marketplace at all; two different lures and a link are enough.
    expect(assessSpam(parsed({ email: "sender@example.com", message: lure }), {}, browser).status).toBe("spam");
  });

  it("leaves buyers, shops and link-free messages alone", () => {
    // A buyer asking about a listing: a marketplace and a link, but no lure.
    expect(assessSpam(parsed({ ...real, message: "Is the jacket on your Vinted still available? https://www.vinted.co.uk/items/123" }), {}, browser).reasons).toEqual([]);
    // A shop customer: a lure-ish phrase and a link, but no marketplace.
    expect(assessSpam(parsed({ ...real, message: "My shipping label didn't print, can you resend it? https://myshop.test/orders/9" }), {}, browser).reasons).toEqual([]);
    // No link: nowhere to send the victim.
    expect(assessSpam(parsed({ ...real, message: "Vinted says my funds are pending, is that normal for your shop?" }), {}, browser).reasons).toEqual([]);
  });
});

describe("bots an owner reported", () => {
  const structured = { name: "Test", company: "Test Company", phone: "+79990000000", email: "someone@gmail.com", industry: "Other" };

  it("bins the placeholder-phone probe however the number is written", () => {
    for (const phone of ["+79990000000", "+7 999 000-00-00", "7 (999) 000 00 00"]) {
      expect(assessSpam(parsed({ ...structured, phone }), {}, browser)).toMatchObject({ status: "spam", reasons: ["placeholder_phone"] });
    }
    // A real Russian mobile is fine.
    expect(assessSpam(parsed({ ...structured, phone: "+7 999 123-45-67" }), {}, browser).reasons).toEqual([]);
  });

  it("bins pitches from lead-gen sending domains, and nothing else about lead generation", () => {
    const pitch = { name: "Aida Fuller", company: "NA", email: "hello@boostleadgen.com", message: "We can grow your pipeline." };
    expect(assessSpam(parsed(pitch), {}, browser)).toMatchObject({ status: "spam", reasons: ["leadgen_sender"] });
    expect(assessSpam(parsed({ ...pitch, email: "x@ultraleadgeneration.com" }), {}, browser).status).toBe("spam");
    // A genuine enquiry that talks about lead generation is untouched.
    expect(assessSpam(parsed({ ...real, message: "Can your form send leads to our CRM for lead generation?" }), {}, browser).reasons).toEqual([]);
  });
});
