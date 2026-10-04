import "dotenv/config";
import { appendFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { LiveNotifier } from "./notify.js";
import { connect, PostgresRunLog, PostgresStore, setup } from "./pg.js";
import { FileRunLog, type RunLog } from "./runs.js";
import { AirtableStore, FileStore, type LeadStore } from "./store.js";

const env = process.env;
const webhookSecret = env.WEBHOOK_SECRET ?? "";
const adminToken = env.ADMIN_TOKEN ?? "";
if (!webhookSecret || webhookSecret === "change-me") console.warn("WEBHOOK_SECRET is not set: the webhook rejects every request until it is.");
if (!adminToken || adminToken === "change-me") console.warn("ADMIN_TOKEN is not set: the dashboard stays locked until it is.");

// STORE=postgres (recommended for deployment), airtable, or file (local demos).
let store: LeadStore;
let runs: RunLog;
if (env.STORE === "postgres") {
  const sql = connect();
  await setup(sql);
  store = new PostgresStore(sql);
  runs = new PostgresRunLog(sql);
} else {
  store = env.STORE === "airtable"
    ? new AirtableStore(env.AIRTABLE_TOKEN ?? "", env.AIRTABLE_BASE_ID ?? "", env.AIRTABLE_TABLE ?? "Leads")
    : new FileStore("data/leads.json");
  runs = new FileRunLog("data/runs.json");
}

const app = createApp({
  store,
  runs,
  notifier: new LiveNotifier({
    slackWebhookUrl: env.SLACK_WEBHOOK_URL || undefined,
    resendApiKey: env.RESEND_API_KEY || undefined,
    from: env.FOLLOW_UP_FROM ?? "Sales <sales@example.com>",
  }),
  adminToken,
  webhookSecret,
  integrations: { slack: !!env.SLACK_WEBHOOK_URL, email: !!env.RESEND_API_KEY },
  logError: (step, err, email) => {
    const line = JSON.stringify({ at: new Date().toISOString(), step, email, error: String(err) });
    console.error(line);
    appendFile("data/errors.log", line + "\n").catch(() => {});
  },
  secureCookies: env.NODE_ENV === "production",
  trustProxy: env.TRUST_PROXY === "true",
});

const port = Number(env.PORT ?? 3200);
serve({ fetch: app.fetch, port });
console.log(`Leadline on http://localhost:${port} · dashboard: /app · demo form: /demo`);
