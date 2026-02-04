/**
 * ID generation utilities
 */

/**
 * Generate unique message ID
 * @returns Generated message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
