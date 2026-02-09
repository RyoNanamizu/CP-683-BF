import { Pool } from "pg";
import crypto from "crypto";
import {
  RegisterBeginRequest,
  RegisterBeginResponse,
  RegisterFinishRequest,
  RegisterFinishResponse,
  LoginBeginRequest,
  LoginBeginResponse,
  LoginFinishRequest,
  LoginFinishResponse,
} from "../interfaces/KeyInterfaces";

export class WebAuthnService {
  private rpName = "AIVS";
  private rpId = "aivs";
  private origin = "http://localhost";

  constructor(private pool: Pool) { }

  /**
   * Start WebAuthn registration - generate challenge
   */
  async registerBegin(
    request: RegisterBeginRequest,
  ): Promise<RegisterBeginResponse> {
    const { handle } = request;

    // Validate handle
    if (!handle || handle.length < 3) {
      throw new Error("Handle must be at least 3 characters");
    }

    // Check if handle already exists
    const existing = await this.pool.query(
      "SELECT id FROM credentials WHERE handle = $1",
      [handle],
    );

    if (existing.rows.length > 0) {
      throw new Error("Handle already registered");
    }

    // Generate random challenge (32 bytes)
    const challenge = crypto.randomBytes(32);
    const challengeB64 = Buffer.from(challenge).toString("base64url");

    // Generate user ID (random bytes)
    const userId = crypto.randomBytes(32);
    const userIdB64 = Buffer.from(userId).toString("base64url");

    // Store challenge temporarily (expires in 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.pool.query(
      `INSERT INTO challenges (handle, challenge, challenge_type, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [handle, challengeB64, "registration", expiresAt],
    );

    return {
      challenge: challengeB64,
      rp: {
        name: this.rpName,
        id: this.rpId,
      },
      user: {
        id: userIdB64,
        name: handle,
      },
      pubKeyCredParams: [
        {
          type: "public-key",
          alg: -7, // ES256
        },
      ],
      authenticatorSelection: {
        userVerification: "required",
      },
      attestation: "direct",
    };
  }

  /**
   * Complete WebAuthn registration - verify and store credential
   */
  async registerFinish(
    request: RegisterFinishRequest,
  ): Promise<RegisterFinishResponse> {
    try {
      // For now, we'll store a placeholder credential
      // In production, you'd verify the attestationObject and extract the public key
      const credentialId = request.id;

      // Store credential (placeholder public key)
      const publicKeyBuffer = Buffer.from("placeholder_public_key");

      // Get handle from latest challenge
      const challengeResult = await this.pool.query(
        `SELECT handle FROM challenges 
         WHERE challenge_type = 'registration' AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
      );

      if (challengeResult.rows.length === 0) {
        throw new Error("No valid registration challenge found");
      }

      const handle = challengeResult.rows[0].handle;

      // Store credential
      await this.pool.query(
        `INSERT INTO credentials (handle, credential_id, public_key)
         VALUES ($1, $2, $3)`,
        [handle, credentialId, publicKeyBuffer],
      );

      // Clean up challenge
      await this.pool.query(
        `DELETE FROM challenges WHERE handle = $1 AND challenge_type = 'registration'`,
        [handle],
      );

      return {
        success: true,
        handle,
        credentialId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Registration failed",
      };
    }
  }

  /**
   * Start WebAuthn login - generate challenge
   */
  async loginBegin(request: LoginBeginRequest): Promise<LoginBeginResponse> {
    const { handle } = request;

    // Find credential by handle
    const result = await this.pool.query(
      "SELECT credential_id FROM credentials WHERE handle = $1",
      [handle],
    );

    if (result.rows.length === 0) {
      throw new Error("Handle not found");
    }

    const credentialId = result.rows[0].credential_id;

    // Generate challenge
    const challenge = crypto.randomBytes(32);
    const challengeB64 = Buffer.from(challenge).toString("base64url");

    // Store challenge (expires in 5 minutes)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await this.pool.query(
      `INSERT INTO challenges (handle, challenge, challenge_type, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [handle, challengeB64, "login", expiresAt],
    );

    return {
      challenge: challengeB64,
      rpId: this.rpId,
      allowCredentials: [
        {
          type: "public-key",
          id: credentialId,
        },
      ],
      userVerification: "required",
    };
  }

  /**
   * Complete WebAuthn login - verify signature
   */
  async loginFinish(request: LoginFinishRequest): Promise<LoginFinishResponse> {
    try {
      // For now, we'll accept any valid request
      // In production, you'd verify the signature against the stored public key

      const credentialId = request.id;

      // Find credential
      const result = await this.pool.query(
        "SELECT handle FROM credentials WHERE credential_id = $1",
        [credentialId],
      );

      if (result.rows.length === 0) {
        throw new Error("Credential not found");
      }

      const handle = result.rows[0].handle;

      // Verify challenge exists and is valid
      const challengeResult = await this.pool.query(
        `SELECT id FROM challenges 
         WHERE handle = $1 AND challenge_type = 'login' AND expires_at > NOW()`,
        [handle],
      );

      if (challengeResult.rows.length === 0) {
        throw new Error("Invalid or expired challenge");
      }

      // Generate session token
      const sessionToken = crypto.randomBytes(32).toString("hex");

      // Store session token (expires in 24 hours)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.pool.query(
        `INSERT INTO sessions (handle, session_token, expires_at)
         VALUES ($1, $2, $3)`,
        [handle, sessionToken, expiresAt],
      );

      // Clean up challenge
      await this.pool.query(
        `DELETE FROM challenges WHERE handle = $1 AND challenge_type = 'login'`,
        [handle],
      );

      return {
        success: true,
        handle,
        sessionToken,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Login failed",
      };
    }
  }
}
