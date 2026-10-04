import type { Lead } from "./lead.js";

export type Tier = "hot" | "warm" | "cold";

export interface Score {
  points: number;
  tier: Tier;
  reasons: string[];
}

const DECISION_MAKER = /\b(ceo|cto|coo|cfo|founder|co-founder|owner|director|head|vp|president|partner)\b/i;
const URGENT = /\b(asap|urgent|this week|immediately|deadline|quickly)\b/i;
const BUYING = /\b(quote|pricing|price|proposal|budget|hire|contract|start)\b/i;

export const TIERS = { hot: 50, warm: 20 } as const;

// Plain rules, not a model: sales can read and tune every point. The dashboard's Scoring page renders this table,
// so what it shows is exactly what runs.
export const RULES: { group: string; when: string; points: number; test: (l: Lead) => boolean }[] = [
  { group: "Email", when: "Uses a company email domain", points: 20, test: (l) => !l.freeEmail },
  { group: "Email", when: "Uses a free email provider (Gmail, Outlook…)", points: -10, test: (l) => l.freeEmail },
  { group: "Budget", when: "Budget of $10,000 or more", points: 35, test: (l) => l.budgetUsd !== null && l.budgetUsd >= 10_000 },
  { group: "Budget", when: "Budget of $2,000 to $9,999", points: 20, test: (l) => l.budgetUsd !== null && l.budgetUsd >= 2_000 && l.budgetUsd < 10_000 },
  { group: "Budget", when: "Budget of $500 to $1,999", points: 10, test: (l) => l.budgetUsd !== null && l.budgetUsd >= 500 && l.budgetUsd < 2_000 },
  { group: "Budget", when: "Budget under $500", points: -5, test: (l) => l.budgetUsd !== null && l.budgetUsd < 500 },
  { group: "Role", when: "Decision-maker role (founder, owner, director, VP, C-level…)", points: 15, test: (l) => !!l.role && DECISION_MAKER.test(l.role) },
  { group: "Contact", when: "Left a phone number", points: 5, test: (l) => !!l.phone },
  { group: "Message", when: "Urgent timeline (“ASAP”, “this week”, “deadline”…)", points: 10, test: (l) => URGENT.test(l.message ?? "") },
  { group: "Message", when: "Buying intent (“quote”, “pricing”, “proposal”, “hire”…)", points: 10, test: (l) => BUYING.test(l.message ?? "") },
  { group: "Message", when: "Very short message (under 15 characters)", points: -5, test: (l) => !!l.message && l.message.length < 15 },
];

const REASON: Record<string, string> = {
  "Uses a company email domain": "company email domain",
  "Uses a free email provider (Gmail, Outlook…)": "free email address",
  "Budget of $10,000 or more": "budget $10k+",
  "Budget of $2,000 to $9,999": "budget $2k+",
  "Budget of $500 to $1,999": "budget $500+",
  "Budget under $500": "budget under $500",
  "Decision-maker role (founder, owner, director, VP, C-level…)": "decision-maker role",
  "Left a phone number": "left a phone number",
  "Urgent timeline (“ASAP”, “this week”, “deadline”…)": "urgent timeline",
  "Buying intent (“quote”, “pricing”, “proposal”, “hire”…)": "buying intent in message",
  "Very short message (under 15 characters)": "very short message",
};

export function scoreLead(lead: Lead): Score {
  const reasons: string[] = [];
  let points = 0;
  for (const r of RULES) {
    if (!r.test(lead)) continue;
    points += r.points;
    reasons.push(`${r.points > 0 ? "+" : ""}${r.points} ${REASON[r.when] ?? r.when}`);
  }
  const tier: Tier = points >= TIERS.hot ? "hot" : points >= TIERS.warm ? "warm" : "cold";
  return { points, tier, reasons };
}
