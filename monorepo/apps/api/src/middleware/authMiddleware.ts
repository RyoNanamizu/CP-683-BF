import { FastifyRequest, FastifyReply } from "fastify";
import { Pool } from "pg";

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    handle: string;
    sessionToken: string;
  };
}

/**
 * Middleware to verify session token from Authorization header or x-session-token header
 * Expected format:
 * - Authorization: Bearer <sessionToken>
 * - OR x-session-token: <sessionToken>
 */
export async function verifySessionToken(
  pool: Pool,
  request: AuthenticatedRequest,
  reply: FastifyReply,
) {
  try {
    // Extract token from Authorization header or x-session-token header
    let token: string | undefined;

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      token = request.headers["x-session-token"] as string;
    }

    if (!token) {
      return reply.code(401).send({
        success: false,
        error:
          "Missing session token. Provide token in Authorization: Bearer <token> or x-session-token header",
      });
    }

    // Query database for valid session
    const result = await pool.query(
      `SELECT handle, session_token, expires_at FROM sessions 
       WHERE session_token = $1 AND expires_at > NOW()`,
      [token],
    );

    if (result.rows.length === 0) {
      return reply.code(401).send({
        success: false,
        error: "Invalid or expired session token",
      });
    }

    const session = result.rows[0];

    // Attach user info to request for downstream handlers
    request.user = {
      handle: session.handle,
      sessionToken: session.session_token,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Session verification failed";
    return reply.code(500).send({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Register auth middleware with the Fastify app
 * Usage: await registerAuthMiddleware(app, pool);
 */
export async function registerAuthMiddleware(app: any, pool: Pool) {
  // This hook runs before route handlers
  app.addHook(
    "onRequest",
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      // Check if route requires authentication (custom property on route)
      if ((request.route as any)?.requiresAuth) {
        await verifySessionToken(pool, request, reply);
      }
    },
  );
}
