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
    groupAtMode: config?.groupAtMode ?? true,
    groupHistoryLimit: config?.groupHistoryLimit ?? 20,
  };
}

/**
 * Custom Zod refinement to validate WebSocket URL format
 */
const wsUrlRegex = /^wss?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/;

const wsUrlSchema = z.string()
  .regex(wsUrlRegex, { message: "Invalid WebSocket URL format. Expected: ws://host:port or wss://host:port" })
  .default("ws://127.0.0.1:3001")
  .describe("NapCat Websocket 连接地址");

export const QQConfigSchema = z.object({
  wsUrl: wsUrlSchema,
  accessToken: z.string().default("access-token").describe("NapCat Websocket Token"),
  enable: z.boolean().default(true).describe("是否启用"),
  groupAtMode: z.boolean().default(true).describe("群组响应模式：默认启用，只有在被@时才会响应"),
  groupHistoryLimit: z.number().default(20).describe("群组历史记录信息条数限制"),
});
