import type { StoredLead } from "./store.js";

export interface Notifier {
  alert(text: string): Promise<void>;
  email(to: string, subject: string, body: string): Promise<void>;
}

// Default: print what would be sent. Safe for demos and tests.
export class ConsoleNotifier implements Notifier {
  readonly sent: { kind: "alert" | "email"; to?: string; text: string }[] = [];
  async alert(text: string) {
    this.sent.push({ kind: "alert", text });
    console.log(`[slack] ${text}`);
  }
  async email(to: string, subject: string, body: string) {
    this.sent.push({ kind: "email", to, text: `${subject}\n\n${body}` });
    console.log(`[email to ${to}] ${subject}`);
  }
}

export class LiveNotifier implements Notifier {
  constructor(
    private opts: { slackWebhookUrl?: string; resendApiKey?: string; from: string },
    private fallback = new ConsoleNotifier(),
  ) {}

  async alert(text: string) {
    if (!this.opts.slackWebhookUrl) return this.fallback.alert(text);
    const res = await fetch(this.opts.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Slack ${res.status}`);
  }

  async email(to: string, subject: string, body: string) {
    if (!this.opts.resendApiKey) return this.fallback.email(to, subject, body);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.opts.from, to, subject, text: body }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export function slackText(lead: StoredLead, isNew: boolean): string {
  const icon = lead.tier === "hot" ? ":fire:" : lead.tier === "warm" ? ":sunny:" : ":snowflake:";
  const budget = lead.budgetUsd ? ` · budget $${lead.budgetUsd.toLocaleString("en-US")}` : "";
  return [
    `${icon} ${isNew ? "New" : "Returning"} ${lead.tier} lead (score ${lead.score}): *${lead.name}*` +
      `${lead.company ? ` at ${lead.company}` : ""}${budget}`,
    `${lead.email}${lead.phone ? ` · ${lead.phone}` : ""} · via ${lead.source}`,
    lead.message ? `> ${lead.message.slice(0, 280)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function followUpEmail(lead: StoredLead): { subject: string; body: string } {
  const first = lead.name.split(" ")[0];
  const next =
    lead.tier === "hot"
      ? "I'd like to set up a 20-minute call this week. Reply with a time that suits you, or book directly from our site."
      : "I'll review the details and come back to you within one business day with next steps.";
  return {
    subject: `Thanks for reaching out${lead.company ? `, ${lead.company}` : ""}`,
    body: `Hi ${first},\n\nThanks for getting in touch. We've received your request.\n\n${next}\n\nBest regards,\nThe team`,
  };
}
