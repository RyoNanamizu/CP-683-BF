/**
 * Validation utilities
 */
import { MessageRequest } from "../interfaces/KeyInterfaces";
import { isValidBase64 } from "./Base64Utils";

/**
 * Validate the message request structure
 */
export function validateMessageRequest(request: MessageRequest): void {
  if (!request.message || typeof request.message !== "string") {
    throw new Error("Invalid message: must be a non-empty string");
  }

  if (
    !Array.isArray(request.ring_public_keys) ||
    request.ring_public_keys.length === 0
  ) {
    throw new Error("Invalid ring_public_keys: must be a non-empty array");
  }

  if (request.ring_public_keys.length !== 8) {
    throw new Error("Invalid ring_public_keys: must have 8 keys");
  }

  if (request.ring_public_keys.some((key) => !isValidBase64(key))) {
    throw new Error("Invalid ring_public_keys: all keys must be valid base64");
  }

  if (!request.outer_signature || !isValidBase64(request.outer_signature)) {
    throw new Error("Invalid outer_signature: must be a valid base64 string");
  }

  if (
    request.encrypted_proof !== null &&
    !isValidBase64(request.encrypted_proof)
  ) {
    throw new Error("Invalid encrypted_proof: must be null or valid base64");
  }
}
