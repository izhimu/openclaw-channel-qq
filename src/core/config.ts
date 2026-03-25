import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { QQAccount, QQAccountConfig, QQGlobalConfig, QQAllowConfig, QQGroupConfig } from "../types";
import { z } from "zod";

export const QQ_CHANNEL = "qq"

export const DEBUG_MODE = false

/**
 * 列出所有 QQ 账户ID
 */
export function listQQAccountIds(cfg: OpenClawConfig): string[] {
  const config = cfg.channels?.[QQ_CHANNEL] as QQGlobalConfig | undefined;

  if (!config?.accounts) {
    // 兼容旧配置：如果没有 accounts 但有 wsUrl，返回 default
    if ((config as any)?.wsUrl) {
      return [DEFAULT_ACCOUNT_ID];
    }
    return [];
  }

  return Object.keys(config.accounts).filter(id => {
    const account = config.accounts[id];
    return account?.wsUrl;  // 只返回有 wsUrl 的账号
  });
}

/**
 * 获取全局默认配置
 */
function getGlobalDefaults(cfg: OpenClawConfig): Partial<QQAccountConfig> {
  const global = cfg.channels?.[QQ_CHANNEL] as QQGlobalConfig | undefined;
  return {
    enabled: global?.enabled ?? true,
    markdownFormat: global?.markdownFormat ?? true,
    messageDirect: global?.messageDirect,
    messageGroup: global?.messageGroup,
  };
}

/**
 * 合并账号配置（账号配置覆盖全局配置）
 */
function mergeAccountConfig(
  accountId: string,
  accountConfig: QQAccountConfig,
  defaults: Partial<QQAccountConfig>
): QQAccount {
  const directConfig: QQAllowConfig = {
    policy: accountConfig.messageDirect?.policy ?? defaults.messageDirect?.policy ?? "allow",
    allowFrom: accountConfig.messageDirect?.allowFrom ?? defaults.messageDirect?.allowFrom ?? [],
    denyFrom: accountConfig.messageDirect?.denyFrom ?? defaults.messageDirect?.denyFrom ?? [],
  };

  const groupConfig: QQGroupConfig = {
    requireMention: accountConfig.messageGroup?.requireMention ?? defaults.messageGroup?.requireMention ?? true,
    requirePoke: accountConfig.messageGroup?.requirePoke ?? defaults.messageGroup?.requirePoke ?? true,
    historyLimit: accountConfig.messageGroup?.historyLimit ?? defaults.messageGroup?.historyLimit ?? 20,
    policy: accountConfig.messageGroup?.policy ?? defaults.messageGroup?.policy ?? "allow",
    allowFrom: accountConfig.messageGroup?.allowFrom ?? defaults.messageGroup?.allowFrom ?? [],
    denyFrom: accountConfig.messageGroup?.denyFrom ?? defaults.messageGroup?.denyFrom ?? [],
    wakeWord: accountConfig.messageGroup?.wakeWord ?? defaults.messageGroup?.wakeWord,
  };

  return {
    accountId,
    enabled: accountConfig.enabled ?? defaults.enabled ?? true,
    wsUrl: accountConfig.wsUrl ?? "",
    accessToken: accountConfig.accessToken,
    token: accountConfig.accessToken,
    markdownFormat: accountConfig.markdownFormat ?? defaults.markdownFormat ?? true,
    agentId: accountConfig.agentId,  // 传递 agentId
    messageDirect: directConfig,
    messageGroup: groupConfig,
    messageGroupsCustom: (accountConfig.messageGroupsCustom ?? {}) as Record<string, QQGroupConfig>,
  };
}

/**
 * 解析 QQ 账户配置
 */
export function resolveQQAccount(params: {
  cfg: OpenClawConfig,
  accountId?: string | null;
}): QQAccount {
  const { cfg, accountId } = params;
  const config = cfg.channels?.[QQ_CHANNEL] as QQGlobalConfig | undefined;
  const defaults = getGlobalDefaults(cfg);

  // 兼容旧配置格式
  if (!config?.accounts && (config as any)?.wsUrl) {
    return {
      accountId: DEFAULT_ACCOUNT_ID,
      enabled: (config as any).enabled !== false,
      wsUrl: (config as any).wsUrl ?? "",
      accessToken: (config as any).accessToken,
      token: (config as any).accessToken,
      markdownFormat: (config as any).markdownFormat ?? true,
      agentId: (config as any).agentId,
      messageDirect: (config as any).messageDirect ?? {
        policy: "allow",
        allowFrom: [],
        denyFrom: [],
      },
      messageGroup: (config as any).messageGroup ?? {
        requireMention: true,
        requirePoke: true,
        historyLimit: 20,
        policy: "allow",
        allowFrom: [],
        denyFrom: [],
      },
      messageGroupsCustom: {},
    };
  }

  // 新配置格式：多账号
  const accounts = config?.accounts ?? {};
  const accountIds = Object.keys(accounts);

  if (accountIds.length === 0) {
    // 返回空账号
    return {
      accountId: DEFAULT_ACCOUNT_ID,
      enabled: false,
      wsUrl: "",
      markdownFormat: true,
      agentId: undefined,
      messageDirect: { policy: "allow", allowFrom: [], denyFrom: [] },
      messageGroup: {
        requireMention: true,
        requirePoke: true,
        historyLimit: 20,
        policy: "allow",
        allowFrom: [],
        denyFrom: [],
      },
      messageGroupsCustom: {},
    };
  }

  // 查找目标账号
  const targetId = accountId ?? accountIds[0];
  const accountConfig = accounts[targetId];

  if (!accountConfig) {
    // 账号不存在，返回第一个账号
    const firstId = accountIds[0];
    return mergeAccountConfig(firstId, accounts[firstId], defaults);
  }

  return mergeAccountConfig(targetId, accountConfig, defaults);
}

/**
 * Custom Zod refinement to validate WebSocket URL format
 */
const wsUrlRegex = /^wss?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/;

const wsUrlSchema = z.string()
  .regex(wsUrlRegex, { message: "Invalid WebSocket URL format. Expected: ws://host:port or wss://host:port" })
  .default("ws://127.0.0.1:3001")
  .describe("NapCat Websocket 连接地址");

const QQDirectConfigSchema = z.object({
  policy: z.enum(["allow", "deny", "allowlist"]).default("allow").describe("私聊策略"),
  allowFrom: z.array(z.string()).default([]).describe("允许的用户").optional(),
  denyFrom: z.array(z.string()).default([]).describe("拒绝的用户").optional(),
}).describe("私聊全局配置");

const QQGroupConfigSchema = z.object({
  requireMention: z.boolean().default(true).describe("群组是否需要@响应"),
  requirePoke: z.boolean().default(true).describe("群组支持戳一戳响应"),
  historyLimit: z.number().default(20).describe("群组历史记录信息条数"),
  policy: z.enum(["allow", "deny", "allowlist"]).default("allow").describe("群组策略"),
  allowFrom: z.array(z.string()).default([]).describe("群组允许的用户").optional(),
  denyFrom: z.array(z.string()).default([]).describe("群组拒绝的用户").optional(),
  wakeWord: z.string().describe("群组唤醒词").optional(),
}).describe("群组全局配置");

// 单账号配置 Schema
const QQAccountConfigSchema = z.object({
  enabled: z.boolean().default(true).describe("是否启用"),
  name: z.string().describe("账号显示名称").optional(),
  wsUrl: wsUrlSchema,
  accessToken: z.string().describe("NapCat Access Token"),
  agentId: z.string().describe("绑定的 Agent ID").optional(),  // agentId
  markdownFormat: z.boolean().default(true).describe("Markdown 格式化").optional(),
  messageDirect: QQDirectConfigSchema.optional(),
  messageGroup: QQGroupConfigSchema.optional(),
  messageGroupsCustom: z.record(z.string(), QQGroupConfigSchema).default({}).optional(),
});

// 全局配置 Schema
export const QQConfigSchema = z.object({
  enabled: z.boolean().default(true).describe("是否启用"),
  markdownFormat: z.boolean().default(true).describe("全局 Markdown 格式化").optional(),
  messageDirect: QQDirectConfigSchema.optional(),
  messageGroup: QQGroupConfigSchema.optional(),
  accounts: z.record(z.string(), QQAccountConfigSchema).default({}).describe("账号配置"),
});
