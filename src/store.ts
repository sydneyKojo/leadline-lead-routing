import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Lead } from "./lead.js";
import type { Score } from "./score.js";

export const STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type LeadStatus = (typeof STATUSES)[number];

export interface StoredLead extends Lead {
  id: string;
  score: number;
  tier: Score["tier"];
  reasons: string[];
  status: LeadStatus;
  notes: string;
  submissions: number;
  createdAt: string;
  updatedAt: string;
}

// The pipeline needs findByEmail/insert/update; the dashboard also lists and opens leads. Any CRM can sit behind it.
export interface LeadStore {
  readonly kind: string;
  findByEmail(email: string): Promise<StoredLead | null>;
  findById(id: string): Promise<StoredLead | null>;
  list(): Promise<StoredLead[]>;
  insert(lead: StoredLead): Promise<void>;
  update(lead: StoredLead): Promise<void>;
}

// Older records (or CRM rows) may lack the newer fields.
export function withDefaults(l: Partial<StoredLead> & Pick<StoredLead, "id" | "email">): StoredLead {
  return {
    name: "", domain: l.email.split("@")[1] ?? "", company: null, phone: null, role: null, budgetUsd: null, message: null,
    source: "web-form", freeEmail: false, score: 0, tier: "cold", reasons: [], status: "new", notes: "", submissions: 1,
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    ...l,
  } as StoredLead;
}

export class MemoryStore implements LeadStore {
  readonly kind = "memory";
  readonly rows = new Map<string, StoredLead>();
  async findByEmail(email: string) {
    return [...this.rows.values()].find((r) => r.email === email) ?? null;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async list() {
    return [...this.rows.values()];
  }
  async insert(lead: StoredLead) {
    this.rows.set(lead.id, lead);
  }
  async update(lead: StoredLead) {
    this.rows.set(lead.id, lead);
  }
}

// A JSON file: good enough for a demo, no account needed.
export class FileStore implements LeadStore {
  readonly kind = "file";
  // Writes are queued so two submissions arriving together can't overwrite each other's changes.
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private path: string) {}

  async all(): Promise<StoredLead[]> {
    try {
      return (JSON.parse(await readFile(this.path, "utf8")) as StoredLead[]).map(withDefaults);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }
  private mutate(fn: (rows: StoredLead[]) => StoredLead[]): Promise<void> {
    const run = this.queue.then(async () => {
      const rows = fn(await this.all());
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, JSON.stringify(rows, null, 2));
      await rename(tmp, this.path); // atomic replace: a crash never leaves a half-written file
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async findByEmail(email: string) {
    return (await this.all()).find((r) => r.email === email) ?? null;
  }
  async findById(id: string) {
    return (await this.all()).find((r) => r.id === id) ?? null;
  }
  async list() {
    return this.all();
  }
  insert(lead: StoredLead) {
    return this.mutate((rows) => [...rows, lead]);
  }
  update(lead: StoredLead) {
    return this.mutate((rows) => rows.map((r) => (r.id === lead.id ? lead : r)));
  }
}

// Airtable REST API. The table needs columns matching the field names below.
export class AirtableStore implements LeadStore {
  readonly kind = "airtable";
  private url: string;
  constructor(
    private token: string,
    baseId: string,
    table: string,
  ) {
    this.url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  }

  private async call(path: string, init?: RequestInit) {
    const res = await fetch(this.url + path, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json() as Promise<{ records?: { id: string; fields: Record<string, unknown> }[] }>;
  }

  private fields(l: StoredLead) {
    return {
      Name: l.name, Email: l.email, Company: l.company ?? "", Phone: l.phone ?? "", Role: l.role ?? "",
      "Budget USD": l.budgetUsd, Message: l.message ?? "", Source: l.source, Score: l.score, Tier: l.tier,
      Submissions: l.submissions, "Lead ID": l.id, "Created At": l.createdAt, "Updated At": l.updatedAt,
      Status: l.status, Notes: l.notes, "Score Reasons": l.reasons.join("\n"),
    };
  }

  private fromRecord(rec: { id: string; fields: Record<string, unknown> }): StoredLead {
    const f = rec.fields;
    const email = String(f.Email ?? "").toLowerCase();
    return withDefaults({
      id: rec.id, name: String(f.Name ?? ""), email, domain: email.split("@")[1] ?? "",
      company: (f.Company as string) || null, phone: (f.Phone as string) || null, role: (f.Role as string) || null,
      budgetUsd: (f["Budget USD"] as number) ?? null, message: (f.Message as string) || null,
      source: String(f.Source ?? "web-form"), score: Number(f.Score ?? 0), tier: (f.Tier as StoredLead["tier"]) ?? "cold",
      reasons: String(f["Score Reasons"] ?? "").split("\n").filter(Boolean),
      status: (f.Status as StoredLead["status"]) ?? "new", notes: String(f.Notes ?? ""),
      submissions: Number(f.Submissions ?? 1), createdAt: String(f["Created At"] ?? ""), updatedAt: String(f["Updated At"] ?? ""),
    });
  }

  async findById(id: string) {
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
    const res = await fetch(`${this.url}/${id}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Airtable ${res.status}`);
    return this.fromRecord((await res.json()) as { id: string; fields: Record<string, unknown> });
  }

  // Airtable pages 100 records at a time.
  async list() {
    const out: StoredLead[] = [];
    let offset = "";
    do {
      const data = (await this.call(`?pageSize=100${offset ? `&offset=${offset}` : ""}`)) as {
        records?: { id: string; fields: Record<string, unknown> }[];
        offset?: string;
      };
      out.push(...(data.records ?? []).map((r) => this.fromRecord(r)));
      offset = data.offset ?? "";
    } while (offset && out.length < 5000);
    return out;
  }

  async findByEmail(email: string) {
    const formula = encodeURIComponent(`LOWER({Email})='${email.replace(/'/g, "\\'")}'`);
    const data = await this.call(`?maxRecords=1&filterByFormula=${formula}`);
    const rec = data.records?.[0];
    return rec ? this.fromRecord(rec) : null;
  }
  async insert(lead: StoredLead) {
    await this.call("", { method: "POST", body: JSON.stringify({ records: [{ fields: this.fields(lead) }], typecast: true }) });
  }
  async update(lead: StoredLead) {
    await this.call("", { method: "PATCH", body: JSON.stringify({ records: [{ id: lead.id, fields: this.fields(lead) }], typecast: true }) });
  }
}
