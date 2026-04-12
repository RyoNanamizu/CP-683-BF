/**
 * Validation Request Interfaces
 * State  process flow:
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

// Validation request database record
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

// Create validation request
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

// List validation requests
export interface ListValidationRequestsResponse {
  success: boolean;

  requests?: ValidationRequestRecord[];

  count?: number;

  error?: string;
}

// Responder action: Respond or Refuse
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
