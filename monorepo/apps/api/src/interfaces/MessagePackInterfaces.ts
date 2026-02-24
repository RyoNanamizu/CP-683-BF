/**
 * Message Pack Interfaces
 * A Message Pack is a bearer asset combining message, signature, and proof
 */

/**
 * Metadata for the message pack
 */
export interface MessagePackMeta {
  version: string;
  hash_algorithm: string;
  curve: string;
}

/**
 * Message component containing the actual content
 */
export interface MessagePackMessage {
  payload: string;
  nonce: string;
  timestamp: string; // ISO8601 format
}

/**
 * Ring signature component for anonymous authentication
 */
export interface MessagePackSignature {
  c0: string;
  r: string[];
  I: string;
  ring: string[];
}

/**
 * Proof component with encrypted data
 */
export interface MessagePackProof {
  gcm: {
    ciphertext: string;
    iv: string;
    tag: string;
  };
  inner_hash: string;
}

/**
 * Complete Message Pack structure
 */
export interface MessagePack {
  meta: MessagePackMeta;
  message: MessagePackMessage;
  signature: MessagePackSignature;
  proof: MessagePackProof;
}

/**
 * Database record for message pack
 */
export interface MessagePackRecord {
  id: string;
  content: string; // JSON string of MessagePack
  owner: string; // username
  timestamp: string; // ISO8601
}

/**
 * Request to create a new message pack
 */
export interface CreateMessagePackRequest {
  messagePack: MessagePack;
  owner: string;
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
