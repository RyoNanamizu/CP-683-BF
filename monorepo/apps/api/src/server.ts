import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { Pool } from "pg";
import { hello } from "@repo/shared";
import { KeyServices } from "./services/KeyServices";
import { WebAuthnService } from "./services/WebAuthnService";
import { MessagePackServices } from "./services/MessagePackServices";
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
import {
  CreateMessagePackRequest,
  TransferOwnershipRequest,
} from "./interfaces/MessagePackInterfaces";

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
const webAuthnService = new WebAuthnService(pool);
const messagePackServices = new MessagePackServices(pool);

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

// ===== MESSAGE PACK API ROUTES =====

// POST /message - Create a message pack
app.post<{ Body: CreateMessagePackRequest }>(
  "/message",
  {
    schema: {
      description:
        "Create a new message pack (bearer asset) - requires valid session token",
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
      body: {
        type: "object",
        required: ["messagePack", "owner"],
        properties: {
          messagePack: {
            type: "object",
            required: ["meta", "message", "signature", "proof"],
            properties: {
              meta: {
                type: "object",
                required: ["version", "hash_algorithm", "curve"],
                properties: {
                  version: { type: "string" },
                  hash_algorithm: { type: "string" },
                  curve: { type: "string" },
                },
              },
              message: {
                type: "object",
                required: ["payload", "nonce", "timestamp"],
                properties: {
                  payload: { type: "string" },
                  nonce: { type: "string" },
                  timestamp: { type: "string", format: "date-time" },
                },
              },
              signature: {
                type: "object",
                required: ["c0", "r", "I", "ring"],
                properties: {
                  c0: { type: "string" },
                  r: {
                    type: "array",
                    items: { type: "string" },
                  },
                  I: { type: "string" },
                  ring: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
              proof: {
                type: "object",
                required: ["gcm", "inner_hash"],
                properties: {
                  gcm: {
                    type: "object",
                    required: ["ciphertext", "iv", "tag"],
                    properties: {
                      ciphertext: { type: "string" },
                      iv: { type: "string" },
                      tag: { type: "string" },
                    },
                  },
                  inner_hash: { type: "string" },
                },
              },
            },
          },
          owner: {
            type: "string",
            description: "Username of the message pack owner",
          },
        },
      },
      response: {
        200: {
          description: "Message pack created successfully",
          type: "object",
          properties: {
            success: { type: "boolean" },
            id: { type: "string" },
            timestamp: { type: "string" },
          },
        },
        400: {
          description: "Invalid request or validation failed",
          type: "object",
          properties: {
            success: { type: "boolean" },
            error: { type: "string" },
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

    const result = await messagePackServices.createMessagePack(
      request.body as CreateMessagePackRequest,
    );
    return reply.code(result.success ? 200 : 400).send(result);
  },
);

// GET /message/by_id/:id - Get message pack by ID
app.get<{ Params: { id: string } }>(
  "/message/by_id/:id",
  {
    schema: {
      description:
        "Retrieve a message pack by its ID - requires valid session token",
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
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: {
            type: "string",
            description: "UUID of the message pack",
          },
        },
      },
      response: {
        200: {
          description: "Message pack retrieved successfully",
          type: "object",
          properties: {
            success: { type: "boolean" },
            messagePack: {
              type: "object",
              properties: {
                id: { type: "string" },
                content: { type: "string" },
                owner: { type: "string" },
                timestamp: { type: "string" },
              },
            },
          },
        },
        400: {
          description: "Message pack not found or error",
          type: "object",
          properties: {
            success: { type: "boolean" },
            error: { type: "string" },
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

    const result = await messagePackServices.getMessagePackById(
      (request.params as { id: string }).id,
    );
    return reply.code(result.success ? 200 : 400).send(result);
  },
);

// GET /message/list/by_username/:username - Get message packs by user
app.get<{ Params: { username: string } }>(
  "/message/list/by_username/:username",
  {
    schema: {
      description:
        "Retrieve all message packs owned by a specific user - requires valid session token",
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
      params: {
        type: "object",
        required: ["username"],
        properties: {
          username: {
            type: "string",
            description: "Username of the owner",
          },
        },
      },
      response: {
        200: {
          description: "Message packs retrieved successfully",
          type: "object",
          properties: {
            success: { type: "boolean" },
            messagePacks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  content: { type: "string" },
                  owner: { type: "string" },
                  timestamp: { type: "string" },
                },
              },
            },
            count: { type: "number" },
          },
        },
        400: {
          description: "Error retrieving message packs",
          type: "object",
          properties: {
            success: { type: "boolean" },
            error: { type: "string" },
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

    const result = await messagePackServices.getMessagePacksByUsername(
      (request.params as { username: string }).username,
    );
    return reply.code(result.success ? 200 : 400).send(result);
  },
);

// PUT /message/by_id/:id/owner - Transfer ownership of a message pack
app.put<{ Params: { id: string }; Body: TransferOwnershipRequest }>(
  "/message/by_id/:id/owner",
  {
    schema: {
      description:
        "Transfer ownership of a message pack to a new owner (bearer asset transfer) - requires valid session token",
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
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: {
            type: "string",
            description: "UUID of the message pack",
          },
        },
      },
      body: {
        type: "object",
        required: ["newOwner"],
        properties: {
          newOwner: {
            type: "string",
            description: "Username of the new owner",
          },
        },
      },
      response: {
        200: {
          description: "Ownership transferred successfully",
          type: "object",
          properties: {
            success: { type: "boolean" },
            id: { type: "string" },
            oldOwner: { type: "string" },
            newOwner: { type: "string" },
            timestamp: { type: "string" },
          },
        },
        400: {
          description: "Transfer failed or message pack not found",
          type: "object",
          properties: {
            success: { type: "boolean" },
            error: { type: "string" },
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

    const result = await messagePackServices.transferOwnership(
      (request.params as { id: string }).id,
      (request.body as { newOwner: string }).newOwner,
    );
    return reply.code(result.success ? 200 : 400).send(result);
  },
);

await app.listen({ host: "0.0.0.0", port: 3000 });
