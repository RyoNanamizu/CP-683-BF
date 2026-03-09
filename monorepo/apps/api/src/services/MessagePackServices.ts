import { Pool } from "pg";
import {
  MessagePackRecord,
  CreateMessagePackRequest,
  CreateMessagePackResponse,
  TransferOwnershipResponse,
  GetMessagePackResponse,
  ListMessagePacksResponse,
} from "../interfaces/MessagePackInterfaces";


export class MessagePackServices {
  constructor(private pool: Pool) { }

  /**
   * Create a new message pack
   */
  async createMessagePack(
    request: CreateMessagePackRequest,
    owner: string,
  ): Promise<CreateMessagePackResponse> {
    try {
      if (!request.messagePack || request.messagePack.trim().length === 0) {
        return {
          success: false,
          error: "messagePack is required",
        };
      }

      if (!request.memo || request.memo.trim().length === 0) {
        return {
          success: false,
          error: "memo is required",
        };
      }

      if (!request.credentialId || request.credentialId.trim().length === 0) {
        return {
          success: false,
          error: "credentialId is required",
        };
      }

      // Validate owner
      if (!owner || owner.trim().length === 0) {
        return {
          success: false,
          error: "Owner username is required",
        };
      }

      const timestamp = new Date().toISOString();

      const result = await this.pool.query(
        `INSERT INTO message_packs (content, memo, credential_id, owner, timestamp)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, timestamp`,
        [request.messagePack, request.memo, request.credentialId, owner, timestamp],
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
   */
  async getMessagePackById(id: string): Promise<GetMessagePackResponse> {
    try {
      const result = await this.pool.query(
        `SELECT id, content, memo, credential_id, owner, timestamp
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
        messagePack: row.content,
        memo: row.memo,
        credentialId: row.credential_id,
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
   */
  async getMessagePacksByUsername(
    username: string,
  ): Promise<ListMessagePacksResponse> {
    try {
      const result = await this.pool.query(
        `SELECT id, content, memo, credential_id, owner, timestamp
         FROM message_packs 
         WHERE owner = $1 
         ORDER BY timestamp DESC`,
        [username],
      );

      const messagePacks: MessagePackRecord[] = result.rows.map((row: any) => ({
        id: row.id,
        messagePack: row.content,
        memo: row.memo,
        credentialId: row.credential_id,
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
