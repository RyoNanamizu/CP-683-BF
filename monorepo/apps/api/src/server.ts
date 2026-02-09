import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { Pool } from "pg";
import sensible from "@fastify/sensible";
import { hello } from "@repo/shared";
import { KeyServices } from "./services/KeyServices";
import { WebAuthnService } from "./services/WebAuthnService";
import {
  verifySessionToken,
  AuthenticatedRequest,
} from "./middleware/authMiddleware";
import {
  MessageRequest,
  MessageResponse,
  RegisterBeginRequest,
  RegisterBeginResponse,
  RegisterFinishRequest,
  RegisterFinishResponse,
  LoginBeginRequest,
  LoginBeginResponse,
  LoginFinishRequest,
  LoginFinishResponse,
} from "./interfaces/KeyInterfaces";

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
await app.register(sensible);

const pool = new Pool({
  host: process.env.PGHOST ?? "db",
  port: Number(process.env.PGPORT ?? "5432"),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "1q2w3e4r5t",
  database: process.env.PGDATABASE ?? "CP683",
});

// Initialize services with pool
const keyServices = new KeyServices(pool);
const webAuthnService = new WebAuthnService(pool);

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

// POST /register/challenge
app.post<{ Body: RegisterBeginRequest }>(
  "/register/challenge",
  {
    schema: {
      description: "Start WebAuthn registration - generate challenge",
      body: {
        type: "object",
        required: ["handle"],
        properties: {
          handle: {
            type: "string",
            description: "User handle (username)",
          },
        },
      },
      response: {
        200: {
          description: "Registration challenge generated",
          type: "object",
          properties: {
            challenge: { type: "string" },
            rp: {
              type: "object",
              properties: {
                name: { type: "string" },
                id: { type: "string" },
              },
            },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
              },
            },
            pubKeyCredParams: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  alg: { type: "number" },
                },
              },
            },
            authenticatorSelection: {
              type: "object",
              properties: {
                userVerification: { type: "string" },
              },
            },
            attestation: { type: "string" },
          },
        },
        400: {
          description: "Invalid request",
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
      },
    },
  },
  async (request, reply): Promise<RegisterBeginResponse> => {
    try {
      const response = await webAuthnService.registerBegin(request.body);
      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Registration failed";
      return reply.code(400).send({ error: errorMessage });
    }
  },
);

// POST /register/publickey
app.post<{ Body: RegisterFinishRequest }>(
  "/register/publickey",
  {
    schema: {
      description:
        "Complete WebAuthn registration - verify and store credential",
      body: {
        type: "object",
        required: ["id", "response"],
        properties: {
          id: {
            type: "string",
            description: "Credential ID",
          },
          response: {
            type: "object",
            properties: {
              clientDataJSON: { type: "string" },
              attestationObject: { type: "string" },
            },
          },
        },
      },
      response: {
        200: {
          description: "Registration successful",
          type: "object",
          properties: {
            success: { type: "boolean" },
            handle: { type: "string" },
            credentialId: { type: "string" },
          },
        },
      },
    },
  },
  async (request, reply): Promise<RegisterFinishResponse> => {
    const response = await webAuthnService.registerFinish(request.body);
    return reply.code(response.success ? 200 : 400).send(response);
  },
);

// POST /auth/challenge
app.post<{ Body: LoginBeginRequest }>(
  "/auth/challenge",
  {
    schema: {
      description: "Start WebAuthn login - generate challenge",
      body: {
        type: "object",
        required: ["handle"],
        properties: {
          handle: {
            type: "string",
            description: "User handle (username)",
          },
        },
      },
      response: {
        200: {
          description: "Login challenge generated",
          type: "object",
          properties: {
            challenge: { type: "string" },
            rpId: { type: "string" },
            allowCredentials: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  id: { type: "string" },
                },
              },
            },
            userVerification: { type: "string" },
          },
        },
        400: {
          description: "Handle not found",
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
      },
    },
  },
  async (request, reply): Promise<LoginBeginResponse> => {
    try {
      const response = await webAuthnService.loginBegin(request.body);
      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Login initiation failed";
      return reply.code(400).send({ error: errorMessage });
    }
  },
);

// POST /auth/challenge
app.post<{ Body: LoginFinishRequest }>(
  "/auth/session",
  {
    schema: {
      description: "Complete WebAuthn login - verify signature",
      body: {
        type: "object",
        required: ["id", "response"],
        properties: {
          id: {
            type: "string",
            description: "Credential ID",
          },
          response: {
            type: "object",
            properties: {
              authenticatorData: { type: "string" },
              clientDataJSON: { type: "string" },
              signature: { type: "string" },
            },
          },
        },
      },
      response: {
        200: {
          description: "Login successful",
          type: "object",
          properties: {
            success: { type: "boolean" },
            handle: { type: "string" },
            sessionToken: { type: "string" },
          },
        },
      },
    },
  },
  async (request, reply): Promise<LoginFinishResponse> => {
    const response = await webAuthnService.loginFinish(request.body);
    return reply.code(response.success ? 200 : 400).send(response);
  },
);

// Protected endpoint example - requires valid session token
// Usage: GET /api/user/profile
// Headers: Authorization: Bearer <sessionToken>
// OR x-session-token: <sessionToken>
app.get(
  "/api/user/profile",
  {
    schema: {
      description:
        "Get authenticated user profile - requires valid session token",
      headers: {
        type: "object",
        properties: {
          authorization: {
            type: "string",
            description: "Bearer token: Authorization: Bearer <sessionToken>",
          },
          "x-session-token": {
            type: "string",
            description: "Alternative: Session token in header",
          },
        },
      },
      response: {
        200: {
          description: "User profile retrieved successfully",
          type: "object",
          properties: {
            success: { type: "boolean" },
            handle: { type: "string" },
            message: { type: "string" },
          },
        },
        401: {
          description: "Unauthorized - invalid or missing session token",
          type: "object",
          properties: {
            success: { type: "boolean" },
            error: { type: "string" },
          },
        },
      },
    },
  },
  async (request: AuthenticatedRequest, reply) => {
    // Verify session token
    const verifyResult = await verifySessionToken(pool, request, reply);
    if (verifyResult !== undefined) return verifyResult;

    // User is authenticated, return profile
    return {
      success: true,
      handle: request.user?.handle,
      message: `Welcome ${request.user?.handle}! This is a protected endpoint.`,
    };
  },
);

// Protected endpoint example - list user's messages
// Usage: GET /api/user/messages
// Headers: Authorization: Bearer <sessionToken>
app.get(
  "/api/user/messages",
  {
    schema: {
      description:
        "Get authenticated user's messages - requires valid session token",
      response: {
        200: {
          description: "Messages retrieved successfully",
          type: "object",
          properties: {
            success: { type: "boolean" },
            handle: { type: "string" },
            messages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  message: { type: "string" },
                  created_at: { type: "string" },
                },
              },
            },
          },
        },
        401: {
          description: "Unauthorized",
          type: "object",
          properties: {
            success: { type: "boolean" },
            error: { type: "string" },
          },
        },
      },
    },
  },
  async (request: AuthenticatedRequest, reply) => {
    // Verify session token
    const verifyResult = await verifySessionToken(pool, request, reply);
    if (verifyResult !== undefined) return verifyResult;

    // Get messages for this user
    const result = await pool.query(
      `SELECT id, message, created_at FROM messages 
       WHERE id IN (
         SELECT id FROM messages ORDER BY created_at DESC LIMIT 10
       )`,
    );

    return {
      success: true,
      handle: request.user?.handle,
      messages: result.rows,
    };
  },
);

await app.listen({ host: "0.0.0.0", port: 3000 });
