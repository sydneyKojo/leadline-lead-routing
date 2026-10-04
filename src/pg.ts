import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { Run, RunLog } from "./runs.js";
import { type LeadStore, type StoredLead, withDefaults } from "./store.js";

export type Sql = postgres.Sql;

export function connect(url = process.env.DATABASE_URL ?? "postgres://localhost:5432/leadline"): Sql {
  return postgres(url, { onnotice: () => {} });
}

// Idempotent: safe to run on every start. Each record is kept whole as JSON, with the fields we query on as columns.
export async function setup(sql: Sql): Promise<void> {
  await sql.unsafe(`
    create table if not exists leads (
      id text primary key,
      email text not null unique,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );
    create table if not exists runs (
      id text primary key,
      at timestamptz not null,
      lead_id text,
      data jsonb not null
    );
    create index if not exists runs_at_idx on runs (at desc);
    create index if not exists runs_lead_idx on runs (lead_id);
  `);
}

export class PostgresStore implements LeadStore {
  readonly kind = "postgres";
  constructor(private sql: Sql) {}

  async findByEmail(email: string) {
    const [r] = await this.sql<{ data: StoredLead }[]>`select data from leads where email = ${email.toLowerCase()}`;
    return r ? withDefaults(r.data) : null;
  }
  async findById(id: string) {
    const [r] = await this.sql<{ data: StoredLead }[]>`select data from leads where id = ${id}`;
    return r ? withDefaults(r.data) : null;
  }
  async list() {
    const rows = await this.sql<{ data: StoredLead }[]>`select data from leads order by updated_at desc`;
    return rows.map((r) => withDefaults(r.data));
  }
  async insert(lead: StoredLead) {
    await this.sql`insert into leads (id, email, data) values (${lead.id}, ${lead.email}, ${this.sql.json(lead as never)})`;
  }
  async update(lead: StoredLead) {
    await this.sql`update leads set email = ${lead.email}, data = ${this.sql.json(lead as never)}, updated_at = now() where id = ${lead.id}`;
  }
}

export class PostgresRunLog implements RunLog {
  constructor(private sql: Sql) {}

  async add(r: Omit<Run, "id">) {
    const run: Run = { ...r, id: randomUUID() };
    await this.sql`insert into runs (id, at, lead_id, data) values (${run.id}, ${run.at}, ${run.leadId}, ${this.sql.json(run as never)})`;
    return run;
  }
  async list(limit = 200) {
    const rows = await this.sql<{ data: Run }[]>`select data from runs order by at desc limit ${limit}`;
    return rows.map((r) => r.data);
  }
  async get(id: string) {
    const [r] = await this.sql<{ data: Run }[]>`select data from runs where id = ${id}`;
    return r?.data ?? null;
  }
  async update(run: Run) {
    await this.sql`update runs set data = ${this.sql.json(run as never)} where id = ${run.id}`;
  }
}
