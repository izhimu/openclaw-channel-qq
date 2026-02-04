/**
 * Config schema for QQ NapCat channel
 */

import { buildChannelConfigSchema } from "openclaw/plugin-sdk";
import { z } from "zod";

/**
 * Zod schema for channels.openclaw-channel-qq.* configuration
 */
export const QqNapCatConfigSchema = z.object();

export type QqNapCatConfig = z.infer<typeof QqNapCatConfigSchema>;

/**
 * JSON Schema for Control UI (converted from Zod)
 */
export const qqNapCatChannelConfigSchema = buildChannelConfigSchema(QqNapCatConfigSchema);
