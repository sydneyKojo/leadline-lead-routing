import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConsoleNotifier } from "../src/notify.js";
import { connect, PostgresRunLog, PostgresStore, setup } from "../src/pg.js";
import { processLead, retryRun } from "../src/pipeline.js";

const sql = connect(process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/leadline_test");
const store = new PostgresStore(sql);
const runs = new PostgresRunLog(sql);

beforeAll(() => setup(sql));
beforeEach(async () => {
  await sql`truncate leads, runs`;
});
afterAll(() => sql.end());

describe("Postgres store", () => {
  it("saves, finds, merges and lists leads", async () => {
    const notifier = new ConsoleNotifier();
    const first = await processLead({ name: "jane doe", email: "Jane@Acme.com", budget: "$3k" }, { store, notifier, runs });
    expect(first.status).toBe("created");
    const again = await processLead({ name: "Jane", email: "jane@acme.com", phone: "+1 415 555 0100" }, { store, notifier, runs });
    expect(again.status).toBe("updated");

    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.submissions).toBe(2);
    expect(all[0]!.phone).toBe("+14155550100");
    expect((await store.findByEmail("JANE@acme.com"))?.id).toBe(all[0]!.id);
    expect(await store.findById("missing")).toBeNull();
  });

  it("keeps a run log and retries failed steps", async () => {
    let slackDown = true;
    const notifier = {
      alert: async () => {
        if (slackDown) throw new Error("Slack down");
      },
      email: async () => {},
    };
    await processLead({ name: "Bo", email: "bo@acme.com" }, { store, notifier, runs });
    const [run] = await runs.list();
    expect(run!.steps.find((s) => s.step === "slack")!.ok).toBe(false);

    slackDown = false;
    await retryRun(run!, { store, notifier, runs });
    const after = await runs.get(run!.id);
    expect(after!.steps.every((s) => s.ok)).toBe(true);
  });
});
