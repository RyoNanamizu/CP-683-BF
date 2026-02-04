/**
 * Interface for the message request payload
 */
export interface MessageRequest {
  message: string;
  ring_public_keys: string[]; // Array of base64-encoded EC public keys
  outer_signature: string; // base64-encoded ring signature
  encrypted_proof: string | null; // base64-encoded AES-GCM ciphertext or null
}

/**
 * Interface for the message response
 */
export interface MessageResponse {
  success: boolean;
  message_id?: string;
  status?: string;
  error?: string;
  timestamp?: string;
}

/**
 * Interface for processed message data internally
 */
export interface ProcessedMessage {
  originalMessage: string;
  publicKeyCount: number;
  hasValidSignature: boolean;
  hasEncryptedProof: boolean;
  processedAt: Date;
}
