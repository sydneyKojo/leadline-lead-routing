import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type Step = "store" | "slack" | "email";
export interface StepResult {
  step: Step;
  ok: boolean;
  error?: string;
  skipped?: boolean;
}

// One record per submission: what came in, what happened, and which steps failed.
export interface Run {
  id: string;
  at: string;
  email: string;
  source: string;
  outcome: "created" | "updated" | "rejected" | "spam";
  leadId: string | null;
  score: number | null;
  tier: string | null;
  errors: string[];
  steps: StepResult[];
  durationMs: number;
  retriedAt?: string;
}

export interface RunLog {
  add(run: Omit<Run, "id">): Promise<Run>;
  list(limit?: number): Promise<Run[]>;
  get(id: string): Promise<Run | null>;
  update(run: Run): Promise<void>;
}

export class MemoryRunLog implements RunLog {
  readonly runs: Run[] = [];
  async add(r: Omit<Run, "id">) {
    const run = { ...r, id: randomUUID() };
    this.runs.unshift(run);
    return run;
  }
  async list(limit = 200) {
    return this.runs.slice(0, limit);
  }
  async get(id: string) {
    return this.runs.find((r) => r.id === id) ?? null;
  }
  async update(run: Run) {
    const i = this.runs.findIndex((r) => r.id === run.id);
    if (i >= 0) this.runs[i] = run;
  }
}

// Newest first, capped so the file can't grow forever. Swap for a database table in production.
export class FileRunLog implements RunLog {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private path: string, private max = 2000) {}

  private async all(): Promise<Run[]> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Run[];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }
  private mutate(fn: (rows: Run[]) => Run[]): Promise<void> {
    const run = this.queue.then(async () => {
      const rows = fn(await this.all()).slice(0, this.max);
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(`${this.path}.tmp`, JSON.stringify(rows, null, 2));
      await rename(`${this.path}.tmp`, this.path);
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async add(r: Omit<Run, "id">) {
    const run = { ...r, id: randomUUID() };
    await this.mutate((rows) => [run, ...rows]);
    return run;
  }
  async list(limit = 200) {
    return (await this.all()).slice(0, limit);
  }
  async get(id: string) {
    return (await this.all()).find((r) => r.id === id) ?? null;
  }
  update(run: Run) {
    return this.mutate((rows) => rows.map((r) => (r.id === run.id ? run : r)));
  }
}
