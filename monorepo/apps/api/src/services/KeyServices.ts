import { Pool } from "pg";
import {
  MessageRequest,
  MessageResponse,
  ProcessedMessage,
} from "../interfaces/KeyInterfaces";
import { validateMessageRequest } from "../utils/ValidationUtils";
import { generateMessageId } from "../utils/IdGenerator";

/**
 * KeyServices - Handles processing of ring signature and encrypted messages
 */
export class KeyServices {
  constructor(private pool: Pool) {}

  /**
   * Process incoming message with ring signature and optional encrypted proof
   * and store it in the database
   * @param request - The message request containing signature and encrypted data
   * @returns Processed message response
   */
  async processMessage(request: MessageRequest): Promise<MessageResponse> {
    try {
      validateMessageRequest(request);

      // Convert base64 strings to Buffer for BYTEA storage
      const ringPublicKeysBuffers = request.ring_public_keys.map((key) =>
        Buffer.from(key, "base64"),
      );
      const outerSignatureBuffer = Buffer.from(
        request.outer_signature,
        "base64",
      );
      const encryptedProofBuffer = request.encrypted_proof
        ? Buffer.from(request.encrypted_proof, "base64")
        : null;

      // Insert into database
      const result = await this.pool.query(
        `INSERT INTO messages (message, ring_public_keys, outer_signature, encrypted_proof)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [
          request.message,
          ringPublicKeysBuffers,
          outerSignatureBuffer,
          encryptedProofBuffer,
        ],
      );

      const row = result.rows[0];

      return {
        success: true,
        message_id: row.id,
        timestamp: row.created_at.toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
