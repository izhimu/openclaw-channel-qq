/**
 * Config schema for QQ NapCat channel
 */

import { buildChannelConfigSchema } from "openclaw/plugin-sdk";
import { z } from "zod";

/**
 * Zod schema for channels.openclaw-channel-qq.* configuration
 */
export const QqNapCatConfigSchema = z.object({
  /** Account name (optional display name) */
  name: z.string().optional(),

  /** Whether this channel is enabled */
  enabled: z.boolean().optional(),

  /** NapCat WebSocket URL (e.g., ws://localhost:3001) */
  wsUrl: z.string().optional(),

  /** Access token for NapCat API (optional) */
  accessToken: z.string().optional(),

  /** Bot user ID (QQ number) for mention detection */
  botUserId: z.number().optional(),
});

export type QqNapCatConfig = z.infer<typeof QqNapCatConfigSchema>;

/**
 * JSON Schema for Control UI (converted from Zod)
 */
export const qqNapCatChannelConfigSchema = buildChannelConfigSchema(QqNapCatConfigSchema);
