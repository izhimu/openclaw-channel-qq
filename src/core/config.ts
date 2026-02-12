/**
 * QQ 配置管理
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { QQConfig } from "../types";
import { z } from "zod";

export const CHANNEL_ID = "qq"

/**
 * 列出所有 QQ 账户ID
 */
export function listQQAccountIds(cfg: OpenClawConfig): string[] {
  const config = cfg.channels?.[CHANNEL_ID] as QQConfig;

  if (config?.wsUrl) {
    return [DEFAULT_ACCOUNT_ID];
  }

  return [];
}

/**
 * 解析 QQ 账户配置
 */
export function resolveQQAccount(params: {
  cfg: OpenClawConfig,
}): QQConfig {
  const config = params.cfg.channels?.[CHANNEL_ID] as QQConfig;

  return {
    enabled: config?.enabled !== false,
    wsUrl: config?.wsUrl ?? "",
    accessToken: config?.accessToken,
  };
}

/**
 * Custom Zod refinement to validate WebSocket URL format
 */
const wsUrlRegex = /^wss?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/;

const wsUrlSchema = z.string()
  .regex(wsUrlRegex, { message: "Invalid WebSocket URL format. Expected: ws://host:port or wss://host:port" })
  .default("ws://127.0.0.1:3001");

export const QQConfigSchema = z.object({
  wsUrl: wsUrlSchema,
  accessToken: z.string().default("access-token"),
  enable: z.boolean().default(true)
});
