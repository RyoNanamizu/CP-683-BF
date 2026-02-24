import { Pool } from "pg";
import {
  MessagePack,
  MessagePackRecord,
  CreateMessagePackRequest,
  CreateMessagePackResponse,
  TransferOwnershipResponse,
  GetMessagePackResponse,
  ListMessagePacksResponse,
} from "../interfaces/MessagePackInterfaces";

/**
 * Service for managing Message Packs
 * Message Pack: A bearer asset combining message, signature, and proof
 */
export class MessagePackServices {
  constructor(private pool: Pool) {}

  /**
   * Validate message pack structure
   */
  private validateMessagePack(messagePack: MessagePack): boolean {
    try {
      // Check meta
      if (
        !messagePack.meta ||
        !messagePack.meta.version ||
        !messagePack.meta.hash_algorithm ||
        !messagePack.meta.curve
      ) {
        return false;
      }

      // Check message
      if (
        !messagePack.message ||
        !messagePack.message.payload ||
        !messagePack.message.nonce ||
        !messagePack.message.timestamp
      ) {
        return false;
      }

      // Check signature
      if (
        !messagePack.signature ||
        !messagePack.signature.c0 ||
        !Array.isArray(messagePack.signature.r) ||
        !messagePack.signature.I ||
        !Array.isArray(messagePack.signature.ring)
      ) {
        return false;
      }

      // Check proof
      if (
        !messagePack.proof ||
        !messagePack.proof.gcm ||
        !messagePack.proof.gcm.ciphertext ||
        !messagePack.proof.gcm.iv ||
        !messagePack.proof.gcm.tag ||
        !messagePack.proof.inner_hash
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new message pack
   * POST /message
   */
  async createMessagePack(
    request: CreateMessagePackRequest,
  ): Promise<CreateMessagePackResponse> {
    try {
      //   // Validate message pack structure
      //   if (!this.validateMessagePack(request.messagePack)) {
      //     return {
      //       success: false,
      //       error: "Invalid message pack structure",
      //     };
      //   }

      // Validate owner
      if (!request.owner || request.owner.trim().length === 0) {
        return {
          success: false,
          error: "Owner username is required",
        };
      }

      const content = JSON.stringify(request.messagePack);
      const timestamp = new Date().toISOString();

      const result = await this.pool.query(
        `INSERT INTO message_packs (content, owner, timestamp) 
         VALUES ($1, $2, $3) 
         RETURNING id, timestamp`,
        [content, request.owner, timestamp],
      );

      return {
        success: true,
        id: result.rows[0].id,
        timestamp: result.rows[0].timestamp,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to create message pack: ${errorMessage}`,
      };
    }
  }

  /**
   * Get a message pack by ID
   * GET /message/by_id/:id
   */
  async getMessagePackById(id: string): Promise<GetMessagePackResponse> {
    try {
      const result = await this.pool.query(
        `SELECT id, content, owner, timestamp 
         FROM message_packs 
         WHERE id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: "Message pack not found",
        };
      }

      const row = result.rows[0];
      const messagePack: MessagePackRecord = {
        id: row.id,
        content: row.content,
        owner: row.owner,
        timestamp: row.timestamp,
      };

      return {
        success: true,
        messagePack,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to retrieve message pack: ${errorMessage}`,
      };
    }
  }

  /**
   * Get all message packs for a specific user
   * GET /message/list/by_username/:username
   */
  async getMessagePacksByUsername(
    username: string,
  ): Promise<ListMessagePacksResponse> {
    try {
      const result = await this.pool.query(
        `SELECT id, content, owner, timestamp 
         FROM message_packs 
         WHERE owner = $1 
         ORDER BY timestamp DESC`,
        [username],
      );

      const messagePacks: MessagePackRecord[] = result.rows.map((row: any) => ({
        id: row.id,
        content: row.content,
        owner: row.owner,
        timestamp: row.timestamp,
      }));

      return {
        success: true,
        messagePacks,
        count: messagePacks.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to retrieve message packs: ${errorMessage}`,
      };
    }
  }

  /**
   * Transfer ownership of a message pack
   * PUT /message/by_id/:id/owner
   */
  async transferOwnership(
    id: string,
    newOwner: string,
  ): Promise<TransferOwnershipResponse> {
    try {
      // Validate new owner
      if (!newOwner || newOwner.trim().length === 0) {
        return {
          success: false,
          error: "New owner username is required",
        };
      }

      // Get current owner
      const currentResult = await this.pool.query(
        `SELECT owner FROM message_packs WHERE id = $1`,
        [id],
      );

      if (currentResult.rows.length === 0) {
        return {
          success: false,
          error: "Message pack not found",
        };
      }

      const oldOwner = currentResult.rows[0].owner;

      // Update owner
      const result = await this.pool.query(
        `UPDATE message_packs 
         SET owner = $1, timestamp = $2 
         WHERE id = $3 
         RETURNING id, timestamp`,
        [newOwner, new Date().toISOString(), id],
      );

      return {
        success: true,
        id: result.rows[0].id,
        oldOwner,
        newOwner,
        timestamp: result.rows[0].timestamp,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to transfer ownership: ${errorMessage}`,
      };
    }
  }
}
