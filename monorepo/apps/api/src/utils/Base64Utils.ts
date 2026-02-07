/**
 * Base64 validation utilities
 */

/**
 * Check if a string is valid base64
 * @param str - String to validate
 * @returns true if valid base64
 */
export function isValidBase64(str: string): boolean {
  try {
    return Buffer.from(str, "base64").toString("base64") === str;
  } catch (err) {
    return false;
  }
}
