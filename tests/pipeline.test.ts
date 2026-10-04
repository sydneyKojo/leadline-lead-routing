import { describe, expect, it } from "vitest";
import { normalise, normalisePhone, parseBudget } from "../src/lead.js";
import { ConsoleNotifier, type Notifier } from "../src/notify.js";
import { processLead } from "../src/pipeline.js";
import { scoreLead } from "../src/score.js";
import { MemoryStore } from "../src/store.js";

const now = () => new Date("2026-10-03T12:00:00Z");

describe("normalise", () => {
  it("cleans name, email, company and phone", () => {
    const l = normalise({ name: "  jane   o'neil-smith ", email: " Jane@Acme-Labs.io ", phone: "+44 (0)20 7946 0958" });
    expect(l.name).toBe("Jane O'Neil-Smith");
    expect(l.email).toBe("jane@acme-labs.io");
    expect(l.company).toBe("Acme Labs");
    expect(l.phone).toBe("+4402079460958");
    expect(l.freeEmail).toBe(false);
  });

  it("does not invent a company for free email", () => {
    expect(normalise({ name: "Sam", email: "sam@gmail.com" }).company).toBeNull();
  });

  it("parses budgets", () => {
    expect(parseBudget("$5k")).toBe(5000);
    expect(parseBudget("2k-5k")).toBe(5000);
    expect(parseBudget("USD 1,500")).toBe(1500);
    expect(parseBudget("not sure")).toBeNull();
  });

  it("drops junk phone numbers", () => {
    expect(normalisePhone("123")).toBeNull();
  });
});

describe("scoreLead", () => {
  it("rates a founder with budget and urgency as hot", () => {
    const s = scoreLead(normalise({ name: "A", email: "a@acme.com", role: "Founder", budget: "$12k", message: "Need a quote ASAP" }));
    expect(s.tier).toBe("hot");
    expect(s.reasons.length).toBeGreaterThan(3);
  });

  it("rates a vague free-email lead as cold", () => {
    expect(scoreLead(normalise({ name: "B", email: "b@yahoo.com", message: "hi" })).tier).toBe("cold");
  });
});

describe("processLead", () => {
  it("rejects invalid input with readable errors", async () => {
    const out = await processLead({ name: "", email: "nope" }, { store: new MemoryStore(), notifier: new ConsoleNotifier(), now });
    expect(out.status).toBe("rejected");
    if (out.status === "rejected") expect(out.errors.join(" ")).toMatch(/email/);
  });

  it("drops honeypot spam without storing it", async () => {
    const store = new MemoryStore();
    const out = await processLead({ name: "Bot", email: "bot@x.com", website: "http://spam" }, { store, notifier: new ConsoleNotifier(), now });
    expect(out.status).toBe("spam");
    expect(store.rows.size).toBe(0);
  });

  it("creates a lead, alerts Slack and sends one follow-up email", async () => {
    const store = new MemoryStore();
    const notifier = new ConsoleNotifier();
    const out = await processLead({ name: "jane doe", email: "jane@acme.com", budget: "$3k" }, { store, notifier, now });
    expect(out.status).toBe("created");
    expect(store.rows.size).toBe(1);
    expect(notifier.sent.map((s) => s.kind)).toEqual(["alert", "email"]);
  });

  it("merges a repeat submission instead of creating a duplicate", async () => {
    const store = new MemoryStore();
    const notifier = new ConsoleNotifier();
    await processLead({ name: "Jane", email: "jane@acme.com", message: "First note" }, { store, notifier, now });
    const out = await processLead(
      { name: "Jane", email: "JANE@acme.com", phone: "+1 415 555 0100", message: "Second note" },
      { store, notifier, now },
    );
    expect(out.status).toBe("updated");
    expect(store.rows.size).toBe(1);
    const lead = [...store.rows.values()][0]!;
    expect(lead.submissions).toBe(2);
    expect(lead.phone).toBe("+14155550100");
    expect(lead.message).toContain("First note");
    expect(lead.message).toContain("Second note");
    // No second follow-up email for a returning lead.
    expect(notifier.sent.filter((s) => s.kind === "email")).toHaveLength(1);
  });

  it("keeps the lead when Slack fails and reports the failed step", async () => {
    const store = new MemoryStore();
    const errors: string[] = [];
    const broken: Notifier = {
      alert: async () => {
        throw new Error("slack down");
      },
      email: async () => {},
    };
    const out = await processLead({ name: "Jo", email: "jo@acme.com" }, { store, notifier: broken, now, logError: (s) => errors.push(s) });
    expect(out.status).toBe("created");
    if (out.status === "created") expect(out.failedSteps).toEqual(["slack"]);
    expect(errors).toEqual(["slack"]);
    expect(store.rows.size).toBe(1);
  });
});
