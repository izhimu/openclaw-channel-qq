/**
 * Typing Status Utilities
 * Handles sending typing indicators via NapCat set_input_status API
 */

import type { ConnectionManager } from '../core/connection.js';
import type { InputStatusEventType } from '../types/index.js';
import { logDebug, logWarn } from './index.js';

/**
 * Send typing status to a user (fire-and-forget)
 * Errors are logged but do not throw
 *
 * @param conn - The connection manager
 * @param userId - The QQ user ID to send typing status to
 * @param eventType - The event type (1 = typing, 2 = stopped typing)
 */
export async function sendTypingStatus(
  conn: ConnectionManager,
  userId: string,
  eventType: InputStatusEventType
): Promise<void> {
  try {
    if (!conn.isConnected()) {
      logDebug('typing', `Not connected, skipping typing status for user ${userId}`);
      return;
    }

    await conn.sendRequest('set_input_status', {
      user_id: userId,
      event_type: eventType,
    });

    logDebug('typing', `Sent typing status ${eventType} to user ${userId}`);
  } catch (error) {
    // Fire-and-forget: log but don't throw
    const message = error instanceof Error ? error.message : String(error);
    logWarn('typing', `Failed to send typing status to user ${userId}: ${message}`);
  }
}

/**
 * Send "typing" status to a user (convenience wrapper)
 */
export async function sendTypingIndicator(conn: ConnectionManager, userId: string): Promise<void> {
  await sendTypingStatus(conn, userId, 1);
}

/**
 * Send "stopped typing" status to a user (convenience wrapper)
 */
export async function sendStoppedTyping(conn: ConnectionManager, userId: string): Promise<void> {
  await sendTypingStatus(conn, userId, 2);
}
