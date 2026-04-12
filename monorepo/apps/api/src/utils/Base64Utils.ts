/**
 * Base64 validation utilities
 */
export function isValidBase64(str: string): boolean {
  try {
    return Buffer.from(str, "base64").toString("base64") === str;
  } catch (err) {
    return false;
  }
}
