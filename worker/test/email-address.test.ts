import { describe, expect, it } from "vitest";
import { plusBase, plusVariantsPattern, reachesInboxOf, undeliverableDomain } from "../src/lib/email-address";

describe("plus addressing", () => {
  it("strips the tag and lowercases", () => {
    expect(plusBase("Kim+Folio@Gmail.com")).toBe("kim@gmail.com");
    expect(plusBase("kim@gmail.com")).toBe("kim@gmail.com");
    expect(plusBase("+tag@gmail.com")).toBe("+tag@gmail.com");
    expect(plusBase("no-at-sign")).toBe("no-at-sign");
  });

  it("lets a base address own its tags, but never the other way round", () => {
    expect(reachesInboxOf("kim+folio@gmail.com", "kim@gmail.com")).toBe(true);
    expect(reachesInboxOf("KIM@gmail.com", "kim@gmail.com")).toBe(true);
    expect(reachesInboxOf("kim@gmail.com", "kim+folio@gmail.com")).toBe(false);
    expect(reachesInboxOf("kim+blog@gmail.com", "kim+folio@gmail.com")).toBe(false);
    expect(reachesInboxOf("kimberly+x@gmail.com", "kim@gmail.com")).toBe(false);
    expect(reachesInboxOf("kim+x@gmail.co", "kim@gmail.com")).toBe(false);
  });

  it("builds an escaped LIKE pattern, only for untagged addresses", () => {
    expect(plusVariantsPattern("kim@gmail.com")).toBe("kim+%@gmail.com");
    expect(plusVariantsPattern("k_m%!@x.com")).toBe("k!_m!%!!+%@x.com");
    expect(plusVariantsPattern("kim+a@gmail.com")).toBeNull();
    expect(plusVariantsPattern("nope")).toBeNull();
  });
});

describe("reserved domains", () => {
  it("spots addresses that can never receive mail", () => {
    expect(undeliverableDomain("alex@example.com")).toBe("example.com");
    expect(undeliverableDomain("a@Mail.Example.ORG.")).toBe("example.org");
    expect(undeliverableDomain("a@site.test")).toBe(".test");
    expect(undeliverableDomain("a@nas.home.arpa")).toBe(".home.arpa");
    expect(undeliverableDomain("a@localhost")).toBe(".localhost");
    expect(undeliverableDomain("a@gmail.com")).toBeNull();
    expect(undeliverableDomain("a@notexample.com")).toBeNull();
    expect(undeliverableDomain("a@latest.dev")).toBeNull();
    expect(undeliverableDomain("nope")).toBeNull();
  });
});
