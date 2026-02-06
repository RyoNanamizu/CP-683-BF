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

/**
 * WebAuthn Registration - Begin Request
 */
export interface RegisterBeginRequest {
  handle: string;
}

/**
 * WebAuthn Registration - Begin Response
 */
export interface RegisterBeginResponse {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
  };
  pubKeyCredParams: Array<{
    type: string;
    alg: number;
  }>;
  authenticatorSelection: {
    userVerification: string;
  };
  attestation: string;
}

/**
 * WebAuthn Registration - Finish Request
 */
export interface RegisterFinishRequest {
  id: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
  };
}

/**
 * WebAuthn Registration - Finish Response
 */
export interface RegisterFinishResponse {
  success: boolean;
  handle?: string;
  credentialId?: string;
  error?: string;
}

/**
 * WebAuthn Login - Begin Request
 */
export interface LoginBeginRequest {
  handle: string;
}

/**
 * WebAuthn Login - Begin Response
 */
export interface LoginBeginResponse {
  challenge: string;
  rpId: string;
  allowCredentials: Array<{
    type: string;
    id: string;
  }>;
  userVerification: string;
}

/**
 * WebAuthn Login - Finish Request
 */
export interface LoginFinishRequest {
  id: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
  };
}

/**
 * WebAuthn Login - Finish Response
 */
export interface LoginFinishResponse {
  success: boolean;
  handle?: string;
  sessionToken?: string;
  error?: string;
}
}
