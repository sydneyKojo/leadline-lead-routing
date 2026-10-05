import { readFile } from "node:fs/promises";
import { getConnInfo } from "@hono/node-server/conninfo";
import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { CONSOLE_COOKIE, issueSession, sessionOk, tokenOk } from "./auth.js";
import type { Notifier } from "./notify.js";
import { processLead, retryRun } from "./pipeline.js";
import { RateLimiter } from "./ratelimit.js";
import type { RunLog } from "./runs.js";
import { STATUSES, type LeadStatus, type LeadStore, type StoredLead } from "./store.js";
import * as V from "./views/app.js";
import { DemoFormPage, HomePage } from "./views/site.js";

export interface AppDeps {
  store: LeadStore;
  notifier: Notifier;
  runs: RunLog;
  adminToken: string;
  webhookSecret: string;
  integrations?: { slack: boolean; email: boolean };
  logError?: (step: string, err: unknown, email: string) => void;
  formLimiter?: RateLimiter;
  secureCookies?: boolean;
  trustProxy?: boolean;
}

// RFC 4180 CSV; cells starting with = + - @ get a leading ' so spreadsheets don't run them as formulas.
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    // Plain numbers and phone numbers (e.g. +233 30 123 4567, -42.5) are safe and left as they are.
    if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d][\d\s().-]*$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function filterLeads(all: StoredLead[], o: { tier?: string; status?: string; q?: string; sort?: string }): StoredLead[] {
  const q = (o.q ?? "").trim().toLowerCase();
  return all
    .filter((l) => !o.tier || o.tier === "all" || l.tier === o.tier)
    .filter((l) => !o.status || o.status === "all" || l.status === o.status)
    .filter((l) => !q || [l.name, l.email, l.company ?? "", l.role ?? ""].some((f) => f.toLowerCase().includes(q)))
    .sort((a, b) => (o.sort === "newest" ? b.updatedAt.localeCompare(a.updatedAt) : b.score - a.score || b.updatedAt.localeCompare(a.updatedAt)));
}

export function createApp(deps: AppDeps) {
  const { store, notifier, runs, adminToken } = deps;
  const formLimiter = deps.formLimiter ?? new RateLimiter(10, 10 * 60_000);
  const app = new Hono();
  const pipelineDeps = { store, notifier, runs, logError: deps.logError };
  // Behind a TLS-terminating proxy (Railway, Render) the request arrives as plain http; trust its forwarded headers.
  const origin = (c: Context) => {
    const url = new URL(c.req.url);
    if (deps.trustProxy) {
      const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
      const host = c.req.header("x-forwarded-host")?.split(",")[0]?.trim();
      if (proto === "https" || proto === "http") url.protocol = `${proto}:`;
      if (host) url.host = host;
    }
    return url.origin;
  };
  const ip = (c: Context) => {
    if (deps.trustProxy) {
      const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
      if (fwd) return fwd;
    }
    try {
      return getConnInfo(c).remote.address ?? "unknown";
    } catch {
      return "unknown";
    }
  };

  // ---------- Public ----------
  app.get("/", (c) => c.html(<HomePage />));
  app.get("/demo", (c) => c.html(<DemoFormPage />));
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/assets/:file{[a-z]+\\.(css|js)}", async (c) => {
    const f = c.req.param("file");
    const body = await readFile(new URL(`../public/${f}`, import.meta.url), "utf8").catch(() => null);
    if (body === null) return c.notFound();
    return c.body(body, 200, { "Content-Type": f.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" });
  });
  app.get("/assets/img/:file{[a-z-]+\\.jpg}", async (c) => {
    const body = await readFile(new URL(`../public/img/${c.req.param("file")}`, import.meta.url)).catch(() => null);
    if (!body) return c.notFound();
    return c.body(body, 200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
  });
  app.get("/n8n/lead-to-crm.workflow.json", async (c) =>
    c.body(await readFile(new URL("../n8n/lead-to-crm.workflow.json", import.meta.url), "utf8"), 200, {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="lead-to-crm.workflow.json"',
    }),
  );

  // The public demo form posts here from the same origin. Rate limited per visitor to keep spam out.
  app.post("/form", async (c) => {
    const o = c.req.header("origin");
    if (o && o !== origin(c)) return c.json({ errors: ["Submissions are only accepted from this site."] }, 403);
    const wait = formLimiter.check(ip(c));
    if (wait > 0) {
      c.header("Retry-After", String(wait));
      return c.json({ errors: [`Too many submissions. Please try again in ${Math.ceil(wait / 60)} minute(s).`] }, 429);
    }
    const outcome = await processLead(await c.req.json().catch(() => null), pipelineDeps);
    if (outcome.status === "rejected") return c.json(outcome, 422);
    // Bots that filled the honeypot get the same reply as people, so they can't tell they were blocked.
    if (outcome.status === "spam") return c.json({ status: "created", tier: "cold" });
    return c.json({ status: outcome.status, tier: outcome.lead.tier });
  });

  // Machine-to-machine: forms, n8n, Zapier. Shared secret in a header, compared in constant time.
  app.post("/webhook/lead", async (c) => {
    if (!tokenOk(c.req.header("x-webhook-secret") ?? "", deps.webhookSecret)) return c.json({ error: "unauthorised" }, 401);
    const outcome = await processLead(await c.req.json().catch(() => null), pipelineDeps);
    return c.json(outcome, outcome.status === "rejected" ? 422 : 200);
  });

  // ---------- Dashboard ----------
  const signedIn = (c: Context) => sessionOk(getCookie(c, CONSOLE_COOKIE), adminToken);
  const flash = (c: Context) => ({ ok: c.req.query("ok"), err: c.req.query("err") });
  const page = async (c: Context, title: string, body: unknown) => {
    const [leads, log] = await Promise.all([store.list(), runs.list(500)]);
    const failed = log.filter((r) => r.steps.some((s) => !s.ok)).length;
    return c.html(
      <V.Shell path={c.req.path} title={title} newLeads={leads.filter((l) => l.status === "new").length} failedRuns={failed}>
        {body as never}
      </V.Shell>,
    );
  };

  app.get("/app/login", (c) => (signedIn(c) ? c.redirect("/app") : c.html(<V.LoginPage error={c.req.query("error") === "1"} next={c.req.query("next")} />)));
  app.post("/app/login", async (c) => {
    const f = await c.req.parseBody();
    const next = typeof f.next === "string" && f.next.startsWith("/app") && !f.next.startsWith("//") ? f.next : "/app";
    if (!tokenOk(String(f.token ?? "").trim(), adminToken)) return c.redirect(`/app/login?error=1&next=${encodeURIComponent(next)}`, 303);
    setCookie(c, CONSOLE_COOKIE, issueSession(adminToken), { httpOnly: true, sameSite: "Strict", secure: deps.secureCookies, path: "/", maxAge: 7 * 86_400 });
    return c.redirect(next, 303);
  });
  app.post("/app/logout", (c) => {
    deleteCookie(c, CONSOLE_COOKIE, { path: "/" });
    return c.redirect("/app/login", 303);
  });
  const guard = async (c: Context, next: () => Promise<void>) => {
    if (c.req.path === "/app/login") return next();
    if (!signedIn(c)) {
      if (c.req.path === "/leads") return c.json({ error: "Sign in to the dashboard first." }, 401);
      return c.redirect(`/app/login?next=${encodeURIComponent(c.req.path)}`, 303);
    }
    return next();
  };
  app.use("/app", guard);
  app.use("/app/*", guard);
  app.use("/leads", guard);

  // JSON list kept for scripts; now requires a dashboard session because it contains personal data.
  app.get("/leads", async (c) => c.json(filterLeads(await store.list(), { sort: "score" })));

  app.get("/app", async (c) => page(c, "Overview", <V.OverviewPage leads={await store.list()} runs={await runs.list(2000)} />));

  app.get("/app/leads", async (c) => {
    const all = await store.list();
    const tier = ["hot", "warm", "cold"].includes(c.req.query("tier") ?? "") ? c.req.query("tier")! : "all";
    const status = (STATUSES as readonly string[]).includes(c.req.query("status") ?? "") ? c.req.query("status")! : "all";
    const q = (c.req.query("q") ?? "").slice(0, 100);
    const sort = c.req.query("sort") === "newest" ? "newest" : "score";
    return page(c, "Leads", <V.LeadsPage leads={filterLeads(all, { tier, status, q, sort })} all={all} tier={tier} status={status} q={q} sort={sort} />);
  });

  app.get("/app/leads/export.csv", async (c) => {
    const rows = filterLeads(await store.list(), { tier: c.req.query("tier"), status: c.req.query("status"), q: c.req.query("q"), sort: c.req.query("sort") });
    const csv = toCsv(
      ["Name", "Email", "Company", "Role", "Phone", "Budget USD", "Score", "Rating", "Stage", "Source", "Enquiries", "First enquiry", "Last enquiry", "Notes"],
      rows.map((l) => [l.name, l.email, l.company, l.role, l.phone, l.budgetUsd, l.score, l.tier, l.status, l.source, l.submissions, l.createdAt, l.updatedAt, l.notes]),
    );
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    });
  });

  app.get("/app/leads/:id", async (c) => {
    const lead = await store.findById(c.req.param("id"));
    if (!lead) return c.html(<V.NotFoundPage />, 404);
    const history = (await runs.list(2000)).filter((r) => r.leadId === lead.id);
    return page(c, lead.name, <V.LeadPage lead={lead} runs={history} {...flash(c)} />);
  });

  app.post("/app/leads/:id", async (c) => {
    const lead = await store.findById(c.req.param("id"));
    if (!lead) return c.html(<V.NotFoundPage />, 404);
    const f = await c.req.parseBody();
    const status = String(f.status ?? "");
    if (!(STATUSES as readonly string[]).includes(status)) return c.redirect(`/app/leads/${lead.id}?err=${encodeURIComponent("Choose a valid stage.")}`, 303);
    await store.update({ ...lead, status: status as LeadStatus, notes: String(f.notes ?? "").slice(0, 4000), updatedAt: lead.updatedAt });
    return c.redirect(`/app/leads/${lead.id}?ok=${encodeURIComponent("Saved.")}`, 303);
  });

  app.get("/app/runs", async (c) => {
    const filter = ["failed", "rejected"].includes(c.req.query("filter") ?? "") ? c.req.query("filter")! : "all";
    return page(c, "Pipeline log", <V.RunsPage runs={await runs.list(500)} filter={filter} {...flash(c)} />);
  });

  app.post("/app/runs/:id/retry", async (c) => {
    const run = await runs.get(c.req.param("id"));
    if (!run) return c.redirect(`/app/runs?err=${encodeURIComponent("That run no longer exists.")}`, 303);
    try {
      const after = await retryRun(run, { store, notifier, runs });
      const stillFailing = after.steps.filter((s) => !s.ok).length;
      const msg = stillFailing ? `Retried. ${stillFailing} step(s) still failing: check the integration settings.` : "Retried. All steps succeeded.";
      return c.redirect(`/app/runs?filter=${stillFailing ? "failed" : "all"}&${stillFailing ? "err" : "ok"}=${encodeURIComponent(msg)}`, 303);
    } catch (e) {
      return c.redirect(`/app/runs?err=${encodeURIComponent((e as Error).message)}`, 303);
    }
  });

  app.get("/app/scoring", (c) => page(c, "Scoring rules", <V.ScoringPage />));
  app.get("/app/integrations", (c) =>
    page(c, "Integrations", (
      <V.IntegrationsPage
        origin={origin(c)}
        store={store.kind}
        slack={deps.integrations?.slack ?? false}
        email={deps.integrations?.email ?? false}
        secretSet={!!deps.webhookSecret && deps.webhookSecret !== "change-me"}
      />
    )),
  );

  app.notFound((c) => c.html(<V.NotFoundPage />, 404));
  return app;
}
