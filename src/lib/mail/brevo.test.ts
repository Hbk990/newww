import { describe, expect, it } from "vitest";

import { brevoPayload, describeFailure, parseSender } from "./brevo";

describe("parseSender", () => {
  it("splits the form people actually put in MAIL_FROM", () => {
    expect(parseSender("DRPHONE <no-reply@drphone.lb>")).toEqual({
      name: "DRPHONE",
      email: "no-reply@drphone.lb",
    });
  });

  it("accepts a bare address, with no name", () => {
    expect(parseSender("no-reply@drphone.lb")).toEqual({
      email: "no-reply@drphone.lb",
    });
  });

  it("tolerates the spacing nobody is careful about", () => {
    expect(parseSender("  DRPHONE   < no-reply@drphone.lb >  ")).toEqual({
      name: "DRPHONE",
      email: "no-reply@drphone.lb",
    });
  });

  it("refuses something that is not an address", () => {
    /*
     * Failing here beats sending from a malformed sender: Brevo would reject
     * it anyway, and a thrown error naming MAIL_FROM is far easier to act on
     * than a 400 in the middle of a customer's registration.
     */
    for (const bad of ["", "DRPHONE", "no-reply@", "@drphone.lb", "a b@c"]) {
      expect(() => parseSender(bad), bad).toThrow(/MAIL_FROM/);
    }
  });
});

describe("brevoPayload", () => {
  it("is the shape Brevo's transactional endpoint expects", () => {
    expect(
      brevoPayload(
        { to: "customer@example.com", subject: "123456 is your code", text: "hi" },
        { name: "DRPHONE", email: "no-reply@drphone.lb" },
      ),
    ).toEqual({
      sender: { name: "DRPHONE", email: "no-reply@drphone.lb" },
      to: [{ email: "customer@example.com" }],
      subject: "123456 is your code",
      textContent: "hi",
    });
  });
});

describe("describeFailure", () => {
  it("lifts Brevo's own code and message out of the body", () => {
    expect(
      describeFailure(401, '{"code":"unauthorized","message":"Key not found"}'),
    ).toBe("Brevo refused the message (HTTP 401): unauthorized: Key not found");
  });

  it("falls back to the raw body when the answer is not JSON", () => {
    /*
     * The case that matters in practice: a proxy or WAF in front of the API
     * returns HTML, and an unguarded JSON.parse would surface as "unexpected
     * token <" — sending someone hunting through this file instead of at their
     * network.
     */
    const message = describeFailure(502, "<html>Bad gateway</html>");
    expect(message).toContain("HTTP 502");
    expect(message).toContain("Bad gateway");
  });

  it("truncates a long body rather than filling the log with it", () => {
    expect(describeFailure(500, "x".repeat(5000)).length).toBeLessThan(400);
  });
});
