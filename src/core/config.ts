/**
 * QQ 配置管理
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { QQConfig } from "../types";
import { z } from "zod";

export const CHANNEL_ID = "qq"

export const DEBUG_MODE = false

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
    token: config?.accessToken ?? "",
    accessToken: config?.accessToken,
    markdownFormat: config?.markdownFormat ?? true,
    messageDirect: {
      policy: config?.messageDirect?.policy ?? "allow",
      allowFrom: config?.messageDirect?.allowFrom ?? [],
      denyFrom: config?.messageDirect?.denyFrom ?? [],
    },
    messageGroup: {
      requireMention: config?.messageGroup?.requireMention ?? true,
      requirePoke: config?.messageGroup?.requirePoke ?? true,
      policy: config?.messageGroup?.policy ?? "allow",
      historyLimit: config?.messageGroup?.historyLimit ?? 20,
      allowFrom: config?.messageGroup?.allowFrom ?? [],
      denyFrom: config?.messageGroup?.denyFrom ?? [],
      wakeWord: config?.messageGroup?.wakeWord ?? undefined,
    },
    messageGroupsCustom: config?.messageGroupsCustom ?? {},
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

export const QQDirectConfigSchema = z.object({
  policy: z.enum(["allow", "deny", "allowlist"]).default("allow").describe("私聊策略"),
  allowFrom: z.array(z.string()).default([]).describe("允许的用户").optional(),
  denyFrom: z.array(z.string()).default([]).describe("拒绝的用户").optional(),
}).describe("私聊全局配置");

export const QQGroupConfigSchema = z.object({
  requireMention: z.boolean().default(true).describe("群组是否需要@响应"),
  requirePoke: z.boolean().default(true).describe("群组支持戳一戳响应"),
  historyLimit: z.number().default(20).describe("群组历史记录信息条数"),
  policy: z.enum(["allow", "deny", "allowlist"]).default("allow").describe("群组策略"),
  allowFrom: z.array(z.string()).default([]).describe("群组允许的用户").optional(),
  denyFrom: z.array(z.string()).default([]).describe("群组拒绝的用户").optional(),
  wakeWord: z.string().describe("群组唤醒词").optional(),
}).describe("群组全局配置");

export const QQConfigSchema = z.object({
  wsUrl: wsUrlSchema,
  accessToken: z.string().default("access-token").describe("NapCat Websocket Token"),
  enabled: z.boolean().default(true).describe("是否启用"),
  markdownFormat: z.boolean().default(true).describe("是否启动 Markdown 格式化转换"),
  messageDirect: QQDirectConfigSchema,
  messageGroup: QQGroupConfigSchema,
  messageGroupsCustom: z.record(z.string(), QQGroupConfigSchema).default({}).describe("特定群组配置").optional(),
});
