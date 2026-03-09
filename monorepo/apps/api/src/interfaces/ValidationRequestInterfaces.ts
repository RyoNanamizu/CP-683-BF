/**
 * Validation Request Interfaces
 *
 * These interfaces define the request/response structures used by:
 * - ValidationRequestServices
 * - Fastify route handlers
 *
 * The validation request state machine:
 *
 * Pending  -> Replied -> Passed / Failed / Error
 *         -> Refused
 */

export type ValidationStatus =
  | "Pending"
  | "Replied"
  | "Passed"
  | "Failed"
  | "Refused"
  | "Error";

// validation request database record
export interface ValidationRequestRecord {
  id: string;

  message_pack_id: string;

  requester: string;

  responder: string;

  status: ValidationStatus;

  response_payload: string | null;

  created_at: string;

  updated_at: string;
}

// create validation request
export interface CreateValidationRequestRequest {
  messagePackId: string;

  requester: string;

  responder: string;
}

export interface CreateValidationRequestResponse {
  success: boolean;

  id?: string;

  reused?: boolean;

  error?: string;
}

// list validation requests
// wsed for: Sent requests (requester = current user) and received requests (responder = current user)
export interface ListValidationRequestsResponse {
  success: boolean;

  requests?: ValidationRequestRecord[];

  count?: number;

  error?: string;
}

// responder action: Respond or Refuse
export interface RespondOrRefuseRequest {
  action: "respond" | "refuse";

  responsePayload?: string;
}

export interface RespondOrRefuseResponse {
  success: boolean;

  id?: string;

  status?: ValidationStatus;

  updated_at?: string;

  error?: string;
}

// Requester action: update verification result
export interface UpdateValidationResultRequest {
  result: "Passed" | "Failed" | "Error";
}

export interface UpdateValidationResultResponse {
  success: boolean;

  id?: string;

  status?: ValidationStatus;

  updated_at?: string;

  error?: string;
}