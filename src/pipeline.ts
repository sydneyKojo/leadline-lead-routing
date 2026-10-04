import { randomUUID } from "node:crypto";
import { LeadInput, normalise } from "./lead.js";
import { type Notifier, followUpEmail, slackText } from "./notify.js";
import { scoreLead } from "./score.js";
import type { Run, RunLog, StepResult } from "./runs.js";
import type { LeadStore, StoredLead } from "./store.js";

export type Outcome =
  | { status: "rejected"; errors: string[] }
  | { status: "spam" }
  | { status: "created" | "updated"; lead: StoredLead; reasons: string[]; failedSteps: string[]; steps: StepResult[] };

export interface Deps {
  store: LeadStore;
  notifier: Notifier;
  now?: () => Date;
  logError?: (step: string, err: unknown, leadEmail: string) => void;
  runs?: RunLog;
}

export const sendAlert = (n: Notifier, lead: StoredLead, isNew: boolean) => n.alert(slackText(lead, isNew));
export const sendFollowUp = (n: Notifier, lead: StoredLead) => {
  const mail = followUpEmail(lead);
  return n.email(lead.email, mail.subject, mail.body);
};

// Re-sends the steps that failed in a run. The lead itself was already saved.
export async function retryRun(run: Run, deps: Pick<Deps, "store" | "notifier" | "runs">): Promise<Run> {
  const lead = run.leadId ? await deps.store.findById(run.leadId) : null;
  if (!lead) throw new Error("The lead for this run no longer exists.");
  const steps = await Promise.all(
    run.steps.map(async (s): Promise<StepResult> => {
      if (s.ok) return s;
      try {
        if (s.step === "slack") await sendAlert(deps.notifier, lead, run.outcome === "created");
        if (s.step === "email") await sendFollowUp(deps.notifier, lead);
        return { step: s.step, ok: true };
      } catch (err) {
        return { step: s.step, ok: false, error: String(err).slice(0, 300) };
      }
    }),
  );
  const updated = { ...run, steps, retriedAt: new Date().toISOString() };
  await deps.runs?.update(updated);
  return updated;
}

// A returning lead keeps what we already knew and fills in anything new.
function merge(existing: StoredLead, incoming: Omit<StoredLead, "id" | "createdAt" | "submissions" | "status" | "notes">): StoredLead {
  const pick = <T>(a: T | null, b: T | null) => b ?? a;
  const message =
    incoming.message && incoming.message !== existing.message
      ? [existing.message, incoming.message].filter(Boolean).join("\n---\n")
      : existing.message;
  return {
    ...existing,
    name: incoming.name || existing.name,
    company: pick(existing.company, incoming.company),
    phone: pick(existing.phone, incoming.phone),
    role: pick(existing.role, incoming.role),
    budgetUsd: pick(existing.budgetUsd, incoming.budgetUsd),
    message,
    source: incoming.source,
    submissions: existing.submissions + 1,
    updatedAt: incoming.updatedAt,
  };
}

export async function processLead(raw: unknown, deps: Deps): Promise<Outcome> {
  const started = Date.now();
  const outcome = await run(raw, deps);
  if (deps.runs) {
    const email = typeof raw === "object" && raw && "email" in raw ? String((raw as { email: unknown }).email).slice(0, 320) : "";
    const source = typeof raw === "object" && raw && "source" in raw ? String((raw as { source: unknown }).source).slice(0, 80) : "web-form";
    await deps.runs.add({
      at: (deps.now ?? (() => new Date()))().toISOString(),
      email: outcome.status === "created" || outcome.status === "updated" ? outcome.lead.email : email.trim().toLowerCase(),
      source: outcome.status === "created" || outcome.status === "updated" ? outcome.lead.source : source,
      outcome: outcome.status,
      leadId: outcome.status === "created" || outcome.status === "updated" ? outcome.lead.id : null,
      score: outcome.status === "created" || outcome.status === "updated" ? outcome.lead.score : null,
      tier: outcome.status === "created" || outcome.status === "updated" ? outcome.lead.tier : null,
      errors: outcome.status === "rejected" ? outcome.errors : [],
      steps: outcome.status === "created" || outcome.status === "updated" ? outcome.steps : [],
      durationMs: Date.now() - started,
    });
  }
  return outcome;
}

async function run(raw: unknown, deps: Deps): Promise<Outcome> {
  const parsed = LeadInput.safeParse(raw);
  if (!parsed.success) {
    return { status: "rejected", errors: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`) };
  }
  if (parsed.data.website) return { status: "spam" };

  const now = (deps.now ?? (() => new Date()))().toISOString();
  const lead = normalise(parsed.data);
  const existing = await deps.store.findByEmail(lead.email);

  let stored: StoredLead;
  if (existing) {
    stored = merge(existing, { ...lead, score: 0, tier: "cold", reasons: [], updatedAt: now });
  } else {
    stored = { ...lead, id: randomUUID(), score: 0, tier: "cold", reasons: [], status: "new", notes: "", submissions: 1, createdAt: now, updatedAt: now };
  }
  const score = scoreLead(stored);
  stored.score = score.points;
  stored.tier = score.tier;
  stored.reasons = score.reasons;

  // Saving the lead must succeed; alerts and emails are best-effort and logged.
  if (existing) await deps.store.update(stored);
  else await deps.store.insert(stored);

  const steps: StepResult[] = [{ step: "store", ok: true }];
  const attempt = async (step: "slack" | "email", fn: () => Promise<void>) => {
    try {
      await fn();
      steps.push({ step, ok: true });
    } catch (err) {
      steps.push({ step, ok: false, error: String(err).slice(0, 300) });
      deps.logError?.(step, err, stored.email);
    }
  };

  await attempt("slack", () => sendAlert(deps.notifier, stored, !existing));
  if (!existing) await attempt("email", () => sendFollowUp(deps.notifier, stored));
  else steps.push({ step: "email", ok: true, skipped: true });

  const failedSteps = steps.filter((s) => !s.ok).map((s) => s.step);
  return { status: existing ? "updated" : "created", lead: stored, reasons: score.reasons, failedSteps, steps };
}
