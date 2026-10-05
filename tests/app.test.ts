import { describe, expect, it } from "vitest";
import { createApp, filterLeads, toCsv } from "../src/app.js";
import { issueSession } from "../src/auth.js";
import type { Notifier } from "../src/notify.js";
import { RateLimiter } from "../src/ratelimit.js";
import { MemoryRunLog } from "../src/runs.js";
import { RULES, scoreLead } from "../src/score.js";
import { MemoryStore } from "../src/store.js";
import { normalise } from "../src/lead.js";

const BASE = "http://leadline.test";
const ADMIN = "admin-token-for-tests";
const SECRET = "webhook-secret-for-tests";

function setup(opts: { slackFails?: boolean; formLimit?: number; trustProxy?: boolean } = {}) {
  const store = new MemoryStore();
  const runs = new MemoryRunLog();
  const state = { slackFails: !!opts.slackFails, alerts: 0, emails: 0 };
  const notifier: Notifier = {
    alert: async () => {
      if (state.slackFails) throw new Error("Slack down");
      state.alerts++;
    },
    email: async () => {
      state.emails++;
    },
  };
  const app = createApp({ store, runs, notifier, adminToken: ADMIN, webhookSecret: SECRET, formLimiter: new RateLimiter(opts.formLimit ?? 50, 60_000), trustProxy: opts.trustProxy });
  const cookie = `leadline_session=${issueSession(ADMIN)}`;
  return { app, store, runs, state, cookie };
}
const json = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("scoring rules table", () => {
  it("every rule has a description and non-zero points", () => {
    for (const r of RULES) {
      expect(r.when.length).toBeGreaterThan(5);
      expect(r.points).not.toBe(0);
    }
  });
  it("budget rules never double count", () => {
    const s = scoreLead(normalise({ name: "A", email: "a@acme.com", budget: "$12k" }));
    expect(s.reasons.filter((r) => r.includes("budget"))).toEqual(["+35 budget $10k+"]);
  });
});

describe("webhook", () => {
  it("requires the shared secret", async () => {
    const { app } = setup();
    expect((await app.request(json("/webhook/lead", { name: "A", email: "a@acme.com" }))).status).toBe(401);
    expect((await app.request(json("/webhook/lead", { name: "A", email: "a@acme.com" }, { "X-Webhook-Secret": "wrong" }))).status).toBe(401);
    const ok = await app.request(json("/webhook/lead", { name: "A", email: "a@acme.com" }, { "X-Webhook-Secret": SECRET }));
    expect(ok.status).toBe(200);
  });

  it("logs every run, including rejected ones", async () => {
    const { app, runs } = setup();
    await app.request(json("/webhook/lead", { name: "A", email: "a@acme.com" }, { "X-Webhook-Secret": SECRET }));
    await app.request(json("/webhook/lead", { name: "", email: "bad" }, { "X-Webhook-Secret": SECRET }));
    const log = await runs.list();
    expect(log.map((r) => r.outcome)).toEqual(["rejected", "created"]);
    expect(log[1]!.steps.map((s) => s.step)).toEqual(["store", "slack", "email"]);
  });
});

describe("public demo form", () => {
  it("rejects cross-site posts", async () => {
    const { app } = setup();
    expect((await app.request(json("/form", { name: "A", email: "a@acme.com" }, { Origin: "https://evil.example" }))).status).toBe(403);
  });
  it("accepts its own https origin behind a proxy", async () => {
    const { app } = setup({ trustProxy: true });
    const headers = { Origin: "https://leads.example.com", "X-Forwarded-Proto": "https", "X-Forwarded-Host": "leads.example.com" };
    expect((await app.request(json("/form", { name: "A", email: "a@acme.com" }, headers))).status).toBe(200);
    expect((await app.request(json("/form", { name: "A", email: "a@acme.com" }, { ...headers, Origin: "https://evil.example" }))).status).toBe(403);
  });
  it("rate limits a visitor", async () => {
    const { app } = setup({ formLimit: 1 });
    expect((await app.request(json("/form", { name: "A", email: "a@acme.com" }))).status).toBe(200);
    expect((await app.request(json("/form", { name: "B", email: "b@acme.com" }))).status).toBe(429);
  });
  it("answers bots the same as people", async () => {
    const { app, store } = setup();
    const res = await app.request(json("/form", { name: "Bot", email: "bot@x.com", website: "spam" }));
    expect(await res.json()).toEqual({ status: "created", tier: "cold" });
    expect((await store.list()).length).toBe(0);
  });
});

describe("dashboard", () => {
  it("redirects to sign-in and keeps lead data private", async () => {
    const { app } = setup();
    const res = await app.request(`${BASE}/app/leads`);
    expect(res.status).toBe(303);
    expect((await app.request(`${BASE}/leads`)).status).toBe(401);
  });

  it("signs in with the admin token", async () => {
    const { app } = setup();
    const res = await app.request(new Request(`${BASE}/app/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: ADMIN, next: "/app/leads" }),
    }));
    expect(res.headers.get("location")).toBe("/app/leads");
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });

  it("updates a lead's stage and notes", async () => {
    const { app, store, cookie } = setup();
    await app.request(json("/form", { name: "A", email: "a@acme.com" }));
    const [lead] = await store.list();
    const res = await app.request(new Request(`${BASE}/app/leads/${lead!.id}`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status: "qualified", notes: "Budget confirmed" }),
    }));
    expect(res.status).toBe(303);
    const after = await store.findById(lead!.id);
    expect([after!.status, after!.notes]).toEqual(["qualified", "Budget confirmed"]);
  });

  it("refuses an unknown stage", async () => {
    const { app, store, cookie } = setup();
    await app.request(json("/form", { name: "A", email: "a@acme.com" }));
    const [lead] = await store.list();
    const res = await app.request(new Request(`${BASE}/app/leads/${lead!.id}`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status: "archived", notes: "" }),
    }));
    expect(decodeURIComponent(res.headers.get("location")!)).toContain("valid stage");
    expect((await store.findById(lead!.id))!.status).toBe("new");
  });

  it("retries only the failed step of a run", async () => {
    const { app, runs, state, cookie } = setup({ slackFails: true });
    await app.request(json("/form", { name: "A", email: "a@acme.com" }));
    const [run] = await runs.list();
    expect(run!.steps.find((s) => s.step === "slack")!.ok).toBe(false);
    expect(state.emails).toBe(1);
    state.slackFails = false;
    await app.request(new Request(`${BASE}/app/runs/${run!.id}/retry`, { method: "POST", headers: { Cookie: cookie } }));
    const [after] = await runs.list();
    expect(after!.steps.every((s) => s.ok)).toBe(true);
    expect(after!.retriedAt).toBeTruthy();
    expect(state.alerts).toBe(1);
    expect(state.emails).toBe(1); // the email had already gone out, so it isn't sent twice
  });

  it("exports filtered leads as CSV", async () => {
    const { app, cookie } = setup();
    await app.request(json("/form", { name: "Hot One", email: "ceo@bigco.com", role: "CEO", budget: "$20k" }));
    await app.request(json("/form", { name: "Cold One", email: "x@gmail.com", message: "hi" }));
    const csv = await (await app.request(`${BASE}/app/leads/export.csv?tier=hot`, { headers: { Cookie: cookie } })).text();
    expect(csv).toContain("Hot One");
    expect(csv).not.toContain("Cold One");
  });
});

describe("helpers", () => {
  it("CSV neutralises formulas but keeps phone numbers", () => {
    expect(toCsv(["a"], [["=SUM(A1)"], ["+44 20 7946 0958"], ["-12.5"], ["@cmd"]])).toBe("a\r\n'=SUM(A1)\r\n+44 20 7946 0958\r\n-12.5\r\n'@cmd\r\n");
  });
  it("filters and sorts leads", () => {
    const mk = (name: string, score: number, tier: "hot" | "warm" | "cold", status: "new" | "won", updatedAt: string) =>
      ({ name, email: `${name}@x.com`, company: null, role: null, score, tier, status, updatedAt }) as never;
    const all = [mk("a", 10, "cold", "new", "2026-01-01"), mk("b", 80, "hot", "won", "2026-01-02"), mk("c", 60, "hot", "new", "2026-01-03")];
    expect(filterLeads(all, { tier: "hot" }).map((l: { name: string }) => l.name)).toEqual(["b", "c"]);
    expect(filterLeads(all, { status: "new", sort: "newest" }).map((l: { name: string }) => l.name)).toEqual(["c", "a"]);
    expect(filterLeads(all, { q: "B" }).map((l: { name: string }) => l.name)).toEqual(["b"]);
  });
});
