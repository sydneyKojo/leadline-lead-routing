// Runs before each deploy: creates tables and loads demo leads into an empty Postgres database.
import "dotenv/config";
import { connect, setup } from "../src/pg.js";
import { ensureDatabase } from "./ensure-db.js";

if (process.env.STORE !== "postgres") {
  console.log("STORE is not postgres: nothing to prepare.");
} else {
  await ensureDatabase(process.env.DATABASE_URL ?? "postgres://localhost:5432/leadline");
  const sql = connect();
  await setup(sql);
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from leads`;
  await sql.end();
  if ((row?.n ?? 0) === 0) {
    console.log("Empty database: loading demo leads.");
    await import("./seed-demo.js");
  } else {
    console.log(`Database ready (${row?.n} leads).`);
  }
}
