/**
 * QQ 配置管理
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { CHANNEL_ID, QQConfig } from "../types/index.js";
import { z } from "zod";

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

export const QQConfigSchema = z.object({
  wsUrl: z.string().default("ws://127.0.0.1:3001"),
  accessToken: z.string().default("access-token"),
  enable: z.boolean().default(true)
});
