/**
 * Security Adapter for QQ NapCat Plugin
 * Handles DM policies and security warnings
 */

import type { AccountConfig } from '../types/index.js';
import type { ChannelSecurityContext } from 'openclaw/plugin-sdk';
import { logWarn } from '../utils/index.js';

/**
 * Resolve DM (direct message) policy for a peer
 * Returns a policy configuration for inbound DM filtering
 *
 * Expected SDK type: ChannelSecurityDmPolicy
 * { policy: string; allowFrom?: Array<string | number> | null; policyPath?: string; allowFromPath: string; approveHint: string; }
 */
export function resolveDmPolicy(
  _ctx: ChannelSecurityContext<AccountConfig>
): { policy: string; allowFrom: Array<string | number> | null; allowFromPath: string; approveHint: string } | null {
  // QQ NapCat doesn't have a built-in friend filtering mechanism at the protocol level
  // Return null to use default OpenClaw behavior (no custom DM policy)
  return null;
}

/**
 * Collect security warnings for a context
 * Returns array of warning strings
 */
export function collectWarnings(
  _ctx: ChannelSecurityContext<AccountConfig>
): string[] {
  const warnings: string[] = [];

  // Warn about QQ's message limitations
  warnings.push('QQ may filter or delay messages based on content and frequency');

  // Warn about recall limitations
  warnings.push('Messages can only be recalled within 2 minutes of sending');

  return warnings;
}

/**
 * Check if a user is a friend
 * Note: This requires querying the friend list from NapCat
 */
export async function isFriend(
  userId: string,
  options: {
    friendList?: string[];
    connection?: {
      sendRequest: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
    };
  }
): Promise<boolean> {
  // If friend list is provided, check directly
  if (options.friendList) {
    return options.friendList.includes(userId);
  }

  // Otherwise, query from NapCat
  if (options.connection) {
    try {
      const response = await options.connection.sendRequest('get_friend_list', {});
      if (response && typeof response === 'object' && 'data' in response) {
        const friends = (response as { data: Array<{ user_id: number }> }).data;
        return friends.some(f => String(f.user_id) === userId);
      }
    } catch (error) {
      logWarn('security', `Failed to check friend status for ${userId}:`, error);
    }
  }

  // Default to false if we can't determine
  return false;
}

/**
 * Security adapter factory
 * Creates a security adapter for the plugin matching ChannelSecurityAdapter<AccountConfig>
 */
export function createSecurityAdapter(options: {
  getConnection?: (accountId: string) => {
    sendRequest: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
  } | undefined;
} = {}) {
  return {
    /**
     * Resolve DM policy for inbound messages
     * Expected signature: (ctx: ChannelSecurityContext<AccountConfig>) => ChannelSecurityDmPolicy | null
     */
    resolveDmPolicy: (ctx: ChannelSecurityContext<AccountConfig>) =>
      resolveDmPolicy(ctx),

    /**
     * Collect security warnings
     * Expected signature: (ctx: ChannelSecurityContext<AccountConfig>) => Promise<string[]> | string[]
     */
    collectWarnings: (ctx: ChannelSecurityContext<AccountConfig>) =>
      collectWarnings(ctx),

    /**
     * Check if user is a friend (custom extension, not part of SDK)
     */
    isFriend: async (userId: string, accountId: string) => {
      const conn = options.getConnection?.(accountId);
      return isFriend(userId, { connection: conn });
    },
  };
}

export type SecurityAdapter = ReturnType<typeof createSecurityAdapter>;
