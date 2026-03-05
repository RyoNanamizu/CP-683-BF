/**
 * Validation Request Services
 *
 * This service supports:
 * - Create a validation request (requester -> responder) for a given message_pack_id
 * - List "sent" requests (requester = current user)
 * - List "received" requests (responder = current user)
 * - Responder responds or refuses (merged action)
 * - Requester updates final result (Passed/Failed/Error)
 *
 * Tips:
 * - Identification is based on the session, not request body, to prevent spoofing.
 */

import { Pool } from "pg";
import {
  ValidationRequestRecord,
  CreateValidationRequestRequest,
  CreateValidationRequestResponse,
  ListValidationRequestsResponse,
  RespondOrRefuseRequest,
  RespondOrRefuseResponse,
  UpdateValidationResultRequest,
  UpdateValidationResultResponse,
} from "../interfaces/ValidationRequestInterfaces";

export class ValidationRequestServices {
  constructor(private pool: Pool) {}

  private isNonEmptyString(v: unknown): v is string {
    return typeof v === "string" && v.trim().length > 0;
  }

  private normalizeHandle(handle: string): string {
    return handle.trim();
  }

  /**
   * Optional: enforce "bearer asset" property.
   */
  private async ensureRequesterOwnsMessagePack(
    messagePackId: string,
    requester: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const r = await this.pool.query(
      `SELECT owner FROM message_packs WHERE id = $1`,
      [messagePackId],
    );

    if (r.rows.length === 0) {
      return { ok: false, error: "Message pack not found" };
    }

    const owner = r.rows[0].owner as string;
    if (owner !== requester) {
      return { ok: false, error: "Requester does not own this message pack" };
    }

    return { ok: true };
  }

  private rowToRecord(row: any): ValidationRequestRecord {
    return {
      id: row.id,
      message_pack_id: row.message_pack_id,
      requester: row.requester,
      responder: row.responder,
      status: row.status,
      response_payload: row.response_payload ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // Create a new validation request. (requester should come from session)
  async createValidationRequest(
    request: CreateValidationRequestRequest,
    opts?: { enforceOwnership?: boolean },
  ): Promise<CreateValidationRequestResponse> {
    try {
      const requester = this.normalizeHandle(request.requester);
      const responder = this.normalizeHandle(request.responder);
      const messagePackId = request.messagePackId;

      if (!this.isNonEmptyString(messagePackId)) {
        return { success: false, error: "Msg Pack Id is required" };
      }
      if (!this.isNonEmptyString(requester)) {
        return { success: false, error: "Requester is required" };
      }
      if (!this.isNonEmptyString(responder)) {
        return { success: false, error: "Responder is required" };
      }
      if (requester === responder) {
        return {
          success: false,
          error: "Requester and responder cannot be the same user",
        };
      }

      // Optional: enforce bearer asset ownership
      if (opts?.enforceOwnership) {
        const own = await this.ensureRequesterOwnsMessagePack(
          messagePackId,
          requester,
        );
        if (!own.ok) return { success: false, error: own.error };
      }

      // Avoid duplicate pending requests for the same (messagePackId, requester, responder)
      // This prevents spamming and keeps UI clean.
      const dup = await this.pool.query(
        `SELECT id, status FROM validation_requests
         WHERE message_pack_id = $1 AND requester = $2 AND responder = $3
         ORDER BY created_at DESC
         LIMIT 1`,
        [messagePackId, requester, responder],
      );

      if (dup.rows.length > 0) {
        const latest = dup.rows[0];
        const status = String(latest.status);
        // If there's already a pending/replied request, return it instead of creating a new one.
        if (status === "Pending" || status === "Replied") {
          return {
            success: true,
            id: latest.id,
            reused: true,
          };
        }
      }

      const result = await this.pool.query(
        `INSERT INTO validation_requests
           (message_pack_id, requester, responder, status, response_payload, created_at, updated_at)
         VALUES
           ($1, $2, $3, 'Pending', NULL, now(), now())
         RETURNING id`,
        [messagePackId, requester, responder],
      );

      return {
        success: true,
        id: result.rows[0].id,
        reused: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to create validation request: ${errorMessage}`,
      };
    }
  }

  // List validation requests sent by a user (requester is current user).
  async listSentByRequester(
    requester: string,
  ): Promise<ListValidationRequestsResponse> {
    try {
      const handle = this.normalizeHandle(requester);
      if (!this.isNonEmptyString(handle)) {
        return { success: false, error: "requester is required" };
      }

      const result = await this.pool.query(
        `SELECT id, message_pack_id, requester, responder, status,
                response_payload, created_at, updated_at
         FROM validation_requests
         WHERE requester = $1
         ORDER BY created_at DESC`,
        [handle],
      );

      const requests = result.rows.map((row: any) => this.rowToRecord(row));
      return {
        success: true,
        requests,
        count: requests.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to list sent validation requests: ${errorMessage}`,
      };
    }
  }

  // List validation requests received by a user (responder is current user).
  async listReceivedByResponder(
    responder: string,
  ): Promise<ListValidationRequestsResponse> {
    try {
      const handle = this.normalizeHandle(responder);
      if (!this.isNonEmptyString(handle)) {
        return { success: false, error: "responder is required" };
      }

      const result = await this.pool.query(
        `SELECT id, message_pack_id, requester, responder, status,
                response_payload, created_at, updated_at
         FROM validation_requests
         WHERE responder = $1
         ORDER BY created_at DESC`,
        [handle],
      );

      const requests = result.rows.map((row: any) => this.rowToRecord(row));
      return {
        success: true,
        requests,
        count: requests.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to list received validation requests: ${errorMessage}`,
      };
    }
  }

  /**
   * Responder action: respond OR refuse (merged endpoint friendly).
   *
   * Rules:
   * - Only responder can call (route layer should pass current user as actingUser)
   * - If action=respond: responsePayload required, status becomes 'Replied'
   * - If action=refuse: status becomes 'Refused'
   * - Only allowed when current status is 'Pending' (prevents double write)
   */
  async respondOrRefuse(
    id: string,
    actingUser: string,
    body: RespondOrRefuseRequest,
  ): Promise<RespondOrRefuseResponse> {
    try {
      const requestId = id;
      const responder = this.normalizeHandle(actingUser);

      if (!this.isNonEmptyString(requestId)) {
        return { success: false, error: "id is required" };
      }
      if (!this.isNonEmptyString(responder)) {
        return { success: false, error: "actingUser is required" };
      }
      if (!body || !this.isNonEmptyString(body.action)) {
        return { success: false, error: "action is required" };
      }

      // Load request and verify ownership (responder)
      const current = await this.pool.query(
        `SELECT id, responder, status
         FROM validation_requests
         WHERE id = $1`,
        [requestId],
      );

      if (current.rows.length === 0) {
        return { success: false, error: "Validation request not found" };
      }

      const row = current.rows[0];
      if (row.responder !== responder) {
        return { success: false, error: "Not allowed: not the responder" };
      }

      const status = String(row.status);
      if (status !== "Pending") {
        return {
          success: false,
          error: `Invalid state transition: current status is ${status}`,
        };
      }

      const action = body.action;
      if (action === "respond") {
        if (!this.isNonEmptyString(body.responsePayload)) {
          return {
            success: false,
            error: "responsePayload is required when action=respond",
          };
        }

        const upd = await this.pool.query(
          `UPDATE validation_requests
           SET status = 'Replied',
               response_payload = $1,
               updated_at = now()
           WHERE id = $2
           RETURNING id, status, updated_at`,
          [body.responsePayload, requestId],
        );

        return {
          success: true,
          id: upd.rows[0].id,
          status: upd.rows[0].status,
          updated_at: upd.rows[0].updated_at,
        };
      }

      if (action === "refuse") {
        const upd = await this.pool.query(
          `UPDATE validation_requests
           SET status = 'Refused',
               updated_at = now()
           WHERE id = $1
           RETURNING id, status, updated_at`,
          [requestId],
        );

        return {
          success: true,
          id: upd.rows[0].id,
          status: upd.rows[0].status,
          updated_at: upd.rows[0].updated_at,
        };
      }

      return {
        success: false,
        error: `Unknown action: ${action}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to update validation request: ${errorMessage}`,
      };
    }
  }

  /**
   * Requester updates final verification result.
   *
   * Rules:
   * - Only requester can call
   * - Allowed only after 'Replied' (may adjust based on frountends needs)
   * - Sets status to 'Passed' | 'Failed' | 'Error'
   */
  async updateValidationResult(
    id: string,
    actingUser: string,
    body: UpdateValidationResultRequest,
  ): Promise<UpdateValidationResultResponse> {
    try {
      const requestId = id;
      const requester = this.normalizeHandle(actingUser);

      if (!this.isNonEmptyString(requestId)) {
        return { success: false, error: "id is required" };
      }
      if (!this.isNonEmptyString(requester)) {
        return { success: false, error: "actingUser is required" };
      }
      if (!body || !this.isNonEmptyString(body.result)) {
        return { success: false, error: "result is required" };
      }

      const allowed = new Set(["Passed", "Failed", "Error"]);
      if (!allowed.has(body.result)) {
        return {
          success: false,
          error: `Invalid result: ${body.result}`,
        };
      }

      const current = await this.pool.query(
        `SELECT id, requester, status
         FROM validation_requests
         WHERE id = $1`,
        [requestId],
      );

      if (current.rows.length === 0) {
        return { success: false, error: "Validation request not found" };
      }

      const row = current.rows[0];
      if (row.requester !== requester) {
        return { success: false, error: "Not allowed: not the requester" };
      }

      const status = String(row.status);

      // If want to allow marking Failed even without reply, relax this logic.
      if (status !== "Replied") {
        return {
          success: false,
          error: `Invalid state transition: current status is ${status}`,
        };
      }

      const upd = await this.pool.query(
        `UPDATE validation_requests
         SET status = $1,
             updated_at = now()
         WHERE id = $2
         RETURNING id, status, updated_at`,
        [body.result, requestId],
      );

      return {
        success: true,
        id: upd.rows[0].id,
        status: upd.rows[0].status,
        updated_at: upd.rows[0].updated_at,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to update validation result: ${errorMessage}`,
      };
    }
  }
}