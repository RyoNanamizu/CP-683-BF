/**
 * Message Pack Interfaces
 * A Message Pack is a bearer asset combining message, signature, and proof
 */

/**
 * Database record for message pack
 */
export interface MessagePackRecord {
  id: string;
  messagePack: string;
  memo: string;
  credentialId: string;
  owner: string; // username
  timestamp: string; // ISO8601
}

/**
 * Request to create a new message pack
 */
export interface CreateMessagePackRequest {
  messagePack: string;
  memo: string;
  credentialId: string;
}

/**
 * Response for message pack creation
 */
export interface CreateMessagePackResponse {
  success: boolean;
  id?: string;
  timestamp?: string;
  error?: string;
}

/**
 * Request to transfer ownership of a message pack
 */
export interface TransferOwnershipRequest {
  newOwner: string;
}

/**
 * Response for ownership transfer
 */
export interface TransferOwnershipResponse {
  success: boolean;
  id?: string;
  oldOwner?: string;
  newOwner?: string;
  timestamp?: string;
  error?: string;
}

/**
 * Response for getting a message pack
 */
export interface GetMessagePackResponse {
  success: boolean;
  messagePack?: MessagePackRecord;
  error?: string;
}

/**
 * Response for listing message packs
 */
export interface ListMessagePacksResponse {
  success: boolean;
  messagePacks?: MessagePackRecord[];
  count?: number;
  error?: string;
}
