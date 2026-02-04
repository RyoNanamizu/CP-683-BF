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

app.get("/health", async () => ({ ok: true }));

app.get("/hello", async () => {
  const r = await pool.query("SELECT NOW() as now");
  return { msg: hello("world"), now: r.rows[0].now };
});

app.listen({ host: "0.0.0.0", port: 3000 });
