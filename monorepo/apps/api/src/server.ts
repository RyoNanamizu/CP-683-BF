import Fastify from "fastify";
import { Pool } from "pg";
import { hello } from "@repo/shared";

const app = Fastify({ logger: true });

const pool = new Pool({
  host: process.env.PGHOST ?? "db",
  port: Number(process.env.PGPORT ?? "5432"),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "appdb",
});

// wont check the db, just returns ok
app.get("/healthz", async () => ({ ok: true }));

// checks the db connection
app.get("/readyz", async () => {
  try {
    await pool.query("SELECT 1 as ok");
    return { ok: true, db: "up" };
  } catch (e) {
    // Fastify will return this error as 500
    return app.httpErrors.serviceUnavailable("db down");
  }
});

app.get("/hello", async () => {
  const r = await pool.query("SELECT NOW() as now");
  return { msg: hello("world"), now: r.rows[0].now };
});

await app.listen({ host: "0.0.0.0", port: 3000 });
