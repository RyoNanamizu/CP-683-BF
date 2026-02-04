import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { Pool } from "pg";
import { hello } from "@repo/shared";
import { KeyServices } from "./services/KeyServices";
import { MessageRequest, MessageResponse } from "./interfaces/KeyInterfaces";

const app = Fastify({ logger: true });

// Register Swagger
await app.register(fastifySwagger, {
  swagger: {
    info: {
      title: "API Server",
      description: "API with PostgreSQL backend",
      version: "1.0.0",
    },
    host: "localhost:3000",
    schemes: ["http"],
    consumes: ["application/json"],
    produces: ["application/json"],
  },
});

// Register Swagger UI
await app.register(fastifySwaggerUi, {
  routePrefix: "/docs",
});

const pool = new Pool({
  host: process.env.PGHOST ?? "db",
  port: Number(process.env.PGPORT ?? "5432"),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "appdb",
});

// Initialize services with pool
const keyServices = new KeyServices(pool);

// wont check the db, just returns ok
app.get(
  "/healthz",
  {
    schema: {
      description: "Health check endpoint",
      response: {
        200: {
          description: "Success",
          type: "object",
          properties: {
            ok: { type: "boolean" },
          },
        },
      },
    },
  },
  async () => ({ ok: true }),
);

// checks the db connection
app.get(
  "/readyz",
  {
    schema: {
      description: "Readiness check endpoint - checks database connection",
      response: {
        200: {
          description: "Success",
          type: "object",
          properties: {
            ok: { type: "boolean" },
            db: { type: "string" },
          },
        },
        503: {
          description: "Service unavailable - database is down",
        },
      },
    },
  },
  async (request, reply) => {
    try {
      await pool.query("SELECT 1 as ok");
      return { ok: true, db: "up" };
    } catch (e) {
      return reply.code(503).send({ ok: false, db: "down" });
    }
  },
);

app.get(
  "/hello",
  {
    schema: {
      description: "Hello endpoint - returns greeting and current timestamp",
      response: {
        200: {
          description: "Success",
          type: "object",
          properties: {
            msg: { type: "string" },
            now: { type: "string" },
          },
        },
      },
    },
  },
  async () => {
    const r = await pool.query("SELECT NOW() as now");
    return { msg: hello("world"), now: r.rows[0].now };
  },
);

// POST /message endpoint
app.post<{ Body: MessageRequest }>(
  "/message",
  {
    schema: {
      description: "Store message with ring signature and encrypted proof",
      body: {
        type: "object",
        required: ["message", "ring_public_keys", "outer_signature"],
        properties: {
          message: {
            type: "string",
            description: "The message to store",
          },
          ring_public_keys: {
            type: "array",
            minItems: 8,
            items: {
              type: "string",
              description: "Base64-encoded EC public key",
            },
            description: "Array of base64-encoded EC public keys",
          },
          outer_signature: {
            type: "string",
            description: "Base64-encoded ring signature",
          },
          encrypted_proof: {
            type: ["string", "null"],
            description: "Base64-encoded AES-GCM ciphertext or null",
          },
        },
      },
      response: {
        200: {
          description: "Message stored successfully",
          type: "object",
          properties: {
            success: { type: "boolean" },
            message_id: { type: "string" },
            timestamp: { type: "string" },
          },
        },
        400: {
          description: "Invalid request",
          type: "object",
          properties: {
            success: { type: "boolean" },
            error: { type: "string" },
            timestamp: { type: "string" },
          },
        },
      },
    },
  },
  async (request, reply): Promise<MessageResponse> => {
    const result = await keyServices.processMessage(request.body);
    return reply.code(result.success ? 200 : 400).send(result);
  },
);

// GET /message/{message_id} endpoint
app.get<{ Params: { message_id: string } }>(
  "/message/:message_id",
  {
    schema: {
      description: "Retrieve a message by ID",
      params: {
        type: "object",
        required: ["message_id"],
        properties: {
          message_id: {
            type: "string",
            description: "UUID of the message",
          },
        },
      },
      response: {
        200: {
          description: "Message retrieved successfully",
          type: "object",
          properties: {
            message_id: { type: "string" },
            message: { type: "string" },
            ring_public_keys: {
              type: "array",
              items: { type: "string" },
            },
            outer_signature: { type: "string" },
            encrypted_proof: { type: ["string", "null"] },
            created_at: { type: "string" },
          },
        },
        404: {
          description: "Message not found",
          type: "object",
          properties: {
            success: { type: "boolean" },
            error: { type: "string" },
          },
        },
      },
    },
  },
  async (request, reply) => {
    try {
      const { message_id } = request.params;

      const result = await pool.query(
        `SELECT id, message, ring_public_keys, outer_signature, encrypted_proof, created_at 
         FROM messages WHERE id = $1`,
        [message_id],
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: "Message not found",
        });
      }

      const row = result.rows[0];

      return {
        message_id: row.id,
        message: row.message,
        ring_public_keys: row.ring_public_keys.map((key: Buffer) =>
          key.toString("base64"),
        ),
        outer_signature: row.outer_signature.toString("base64"),
        encrypted_proof: row.encrypted_proof
          ? row.encrypted_proof.toString("base64")
          : null,
        created_at: row.created_at.toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return reply.code(500).send({
        success: false,
        error: errorMessage,
      });
    }
  },
);

await app.listen({ host: "0.0.0.0", port: 3000 });
