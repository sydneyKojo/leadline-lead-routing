import { z } from "zod";

// What a web form (or n8n, Typeform, Webflow...) posts to the webhook.
export const LeadInput = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  email: z.email("email is not valid").max(320),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  role: z.string().trim().max(120).optional(),
  budget: z.string().trim().max(60).optional(),
  message: z.string().trim().max(5000).optional(),
  source: z.string().trim().max(80).optional(),
  // Honeypot: real users never see or fill this field.
  website: z.string().optional(),
});
export type LeadInput = z.infer<typeof LeadInput>;

export interface Lead {
  name: string;
  email: string;
  domain: string;
  company: string | null;
  phone: string | null;
  role: string | null;
  budgetUsd: number | null;
  message: string | null;
  source: string;
  freeEmail: boolean;
}

const FREE_EMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "yandex.com",
]);

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((p) => (/^[a-z]/.test(p) ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join("");
}

// Keeps a leading + and digits only; anything too short to be a phone is dropped.
export function normalisePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const plus = raw.trim().startsWith("+") || raw.trim().startsWith("00");
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return plus ? `+${digits}` : digits;
}

// "$5k", "5,000", "2k-5k" (top of range), "USD 1500" -> number. Unknown -> null.
export function parseBudget(raw: string | undefined): number | null {
  if (!raw) return null;
  const nums = [...raw.toLowerCase().replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(k|m)?/g)].map((m) => {
    const n = Number(m[1]);
    return m[2] === "k" ? n * 1_000 : m[2] === "m" ? n * 1_000_000 : n;
  });
  return nums.length ? Math.max(...nums) : null;
}

function companyFromDomain(domain: string): string {
  const base = domain.split(".").slice(0, -1).join(" ") || domain;
  return titleCase(base.replace(/[-_]/g, " "));
}

export function normalise(input: LeadInput): Lead {
  const email = input.email.trim().toLowerCase();
  const domain = email.split("@")[1]!;
  const freeEmail = FREE_EMAIL.has(domain);
  const company = input.company?.trim() || (freeEmail ? null : companyFromDomain(domain));
  return {
    name: titleCase(input.name.replace(/\s+/g, " ").trim()),
    email,
    domain,
    company,
    phone: normalisePhone(input.phone),
    role: input.role?.trim() || null,
    budgetUsd: parseBudget(input.budget),
    message: input.message?.trim() || null,
    source: input.source?.trim() || "web-form",
    freeEmail,
  };
}
