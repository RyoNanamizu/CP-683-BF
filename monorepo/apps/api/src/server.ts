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
import { ValidationRequestServices } from "./services/ValidationRequestServices";
import {
  CreateValidationRequestRequest,
  RespondOrRefuseRequest,
  UpdateValidationResultRequest,
} from "./interfaces/ValidationRequestInterfaces";

const app = Fastify({ logger: true, trustProxy: true });

// Register Swagger
await app.register(fastifySwagger, {
  swagger: {
    info: {
      title: "API Server",
      description: "API with PostgreSQL backend",
      version: "1.0.0",
    },
    // don't fix host/schemes; let the UI adapt to the current access entry point.
    // host: "localhost:3000",
    // schemes: ["http"],
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

// GET /session
app.get(
  "/session",
  {
    schema: {
      description:
        "Get current session info (username and credentialId) - requires valid session token",
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
          description: "Session info retrieved successfully",
          type: "object",
          properties: {
            success: { type: "boolean" },
            username: { type: "string" },
            credentialId: { type: "string" },
            creditialId: { type: "string" },
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
        404: {
          description: "Credential not found for session user",
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
    const verifyResult = await verifySessionToken(pool, request, reply);
    if (verifyResult !== undefined) {
      return verifyResult;
    }

    const username = request.user?.handle;

    if (!username) {
      return reply.code(401).send({
        success: false,
        error: "Invalid session data",
      });
    }

    const credentialResult = await pool.query(
      "SELECT credential_id FROM credentials WHERE handle = $1",
      [username],
    );

    if (credentialResult.rows.length === 0) {
      return reply.code(404).send({
        success: false,
        error: "Credential not found for session user",
      });
    }

    const credentialId = credentialResult.rows[0].credential_id;

    return {
      success: true,
      username,
      credentialId,
      creditialId: credentialId,
    };
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

// ===== Validation Request API ROUTES =====

// Initialize services
const validationRequestServices = new ValidationRequestServices(pool);

// Local DTO for create body (frontend should NOT send requester identity)
type CreateValidationRequestBody = {
  messagePackId: string;
  responder: string; // handle/username of the responder
};

// map snake_case record to camelCase response item
function mapValidationRecord(r: any) {
  return {
    id: r.id,
    messagePackId: r.message_pack_id,
    requester: r.requester,
    responder: r.responder,
    status: r.status,
    responsePayload: r.response_payload ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// POST /validation-requests - create a validation request (Sent)
app.post<{ Body: CreateValidationRequestBody }>(
  "/validation-requests",
  {
    schema: {
      description:
        "Create a validation request (Sent Validation Requests) - requires valid session token",
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
        required: ["messagePackId", "responder"],
        properties: {
          messagePackId: { type: "string" },
          responder: { type: "string" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            id: { type: "string" },
            reused: { type: "boolean" },
          },
        },
        400: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
        401: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
      },
    },
  },
  async (request: AuthenticatedRequest, reply) => {
    const verifyResult = await verifySessionToken(pool, request, reply);
    if (verifyResult !== undefined) return verifyResult;

    const requester = request.user!.handle;
    const body = request.body as CreateValidationRequestBody;

    const svcReq: CreateValidationRequestRequest = {
      messagePackId: body.messagePackId,
      requester,
      responder: body.responder,
    };

    // if want strict bearer-asset enforcement:
    // const result = await validationRequestServices.createValidationRequest(svcReq, { enforceOwnership: true });
    const result = await validationRequestServices.createValidationRequest(svcReq);

    return reply.code(result.success ? 200 : 400).send(result);
  },
);

// GET /validation-requests/sent - list sent requests
app.get(
  "/validation-requests/sent",
  {
    schema: {
      description:
        "List validation requests sent by current user - requires valid session token",
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
          type: "object",
          properties: {
            success: { type: "boolean" },
            requests: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  messagePackId: { type: "string" },
                  requester: { type: "string" },
                  responder: { type: "string" },
                  status: { type: "string" },
                  responsePayload: { type: ["string", "null"] },
                  createdAt: { type: "string" },
                  updatedAt: { type: "string" },
                },
              },
            },
            count: { type: "number" },
          },
        },
        400: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
        401: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
      },
    },
  },
  async (request: AuthenticatedRequest, reply) => {
    const verifyResult = await verifySessionToken(pool, request, reply);
    if (verifyResult !== undefined) return verifyResult;

    const requester = request.user!.handle;
    const result = await validationRequestServices.listSentByRequester(requester);

    if (!result.success) return reply.code(400).send(result);

    return reply.code(200).send({
      success: true,
      requests: (result.requests ?? []).map(mapValidationRecord),
      count: result.count ?? 0,
    });
  },
);

// GET /validation-requests/received - list received requests
app.get(
  "/validation-requests/received",
  {
    schema: {
      description:
        "List validation requests received by current user - requires valid session token",
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
          type: "object",
          properties: {
            success: { type: "boolean" },
            requests: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  messagePackId: { type: "string" },
                  requester: { type: "string" },
                  responder: { type: "string" },
                  status: { type: "string" },
                  responsePayload: { type: ["string", "null"] },
                  createdAt: { type: "string" },
                  updatedAt: { type: "string" },
                },
              },
            },
            count: { type: "number" },
          },
        },
        400: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
        401: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
      },
    },
  },
  async (request: AuthenticatedRequest, reply) => {
    const verifyResult = await verifySessionToken(pool, request, reply);
    if (verifyResult !== undefined) return verifyResult;

    const responder = request.user!.handle;
    const result =
      await validationRequestServices.listReceivedByResponder(responder);

    if (!result.success) return reply.code(400).send(result);

    return reply.code(200).send({
      success: true,
      requests: (result.requests ?? []).map(mapValidationRecord),
      count: result.count ?? 0,
    });
  },
);

// PUT /validation-requests/:id/respond - responder responds OR refuses (merged)
app.put<{ Params: { id: string }; Body: RespondOrRefuseRequest }>(
  "/validation-requests/:id/respond",
  {
    schema: {
      description:
        "Responder responds or refuses a validation request (merged) - requires valid session token",
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
          id: { type: "string", description: "UUID of the validation request" },
        },
      },
      body: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["respond", "refuse"] },
          responsePayload: { type: "string" },
        },
        allOf: [
          {
            if: {
              properties: { action: { const: "respond" } },
            },
            then: {
              required: ["responsePayload"],
            },
          },
        ],
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            id: { type: "string" },
            status: { type: "string" },
            updated_at: { type: "string" },
          },
        },
        400: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
        401: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
      },
    },
  },
  async (request: AuthenticatedRequest, reply) => {
    const verifyResult = await verifySessionToken(pool, request, reply);
    if (verifyResult !== undefined) return verifyResult;

    const responder = request.user!.handle;
    const id = (request.params as { id: string }).id;

    const result = await validationRequestServices.respondOrRefuse(
      id,
      responder,
      request.body as RespondOrRefuseRequest,
    );

    return reply.code(result.success ? 200 : 400).send(result);
  },
);

// PUT /validation-requests/:id/result - requester sets final verification result
app.put<{ Params: { id: string }; Body: UpdateValidationResultRequest }>(
  "/validation-requests/:id/result",
  {
    schema: {
      description:
        "Requester sets validation result (Passed/Failed/Error) - requires valid session token",
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
          id: { type: "string", description: "UUID of the validation request" },
        },
      },
      body: {
        type: "object",
        required: ["result"],
        properties: {
          result: { type: "string", enum: ["Passed", "Failed", "Error"] },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            id: { type: "string" },
            status: { type: "string" },
            updated_at: { type: "string" },
          },
        },
        400: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
        401: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
      },
    },
  },
  async (request: AuthenticatedRequest, reply) => {
    const verifyResult = await verifySessionToken(pool, request, reply);
    if (verifyResult !== undefined) return verifyResult;

    const requester = request.user!.handle;
    const id = (request.params as { id: string }).id;

    const result = await validationRequestServices.updateValidationResult(
      id,
      requester,
      request.body as UpdateValidationResultRequest,
    );

    return reply.code(result.success ? 200 : 400).send(result);
  },
);


await app.listen({ host: "0.0.0.0", port: 3000 });
