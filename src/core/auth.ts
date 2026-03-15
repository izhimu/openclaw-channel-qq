/**
 * QQ 频道授权模块
 *
 * 使用三明治模式 (Sandwich Pattern) 集成 OpenClaw 原生授权系统:
 *
 * 1. 预处理层 (QQ 特有): denyFrom, policy='deny'
 * 2. SDK 层 (OpenClaw 原生): commands.allowFrom 检查
 * 3. 后处理层 (QQ 特有): allowFrom 覆盖, policy='allowlist'
 *
 * 授权优先级链 (从高到低):
 * 1. denyFrom - 绝对拒绝
 * 2. policy='deny' - 频道级全局拒绝
 * 3. allowFrom - 频道级白名单 (最高优先授权)
 * 4. commands.allowFrom.qq - 全局 QQ 专属授权
 * 5. commands.allowFrom["*"] - 全局通配授权
 * 6. policy='allow' - 频道级全局允许
 * 7. policy='allowlist' 未匹配 - 拒绝
 * 8. 默认 - 拒绝
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { Logger as log } from "../utils/index.js";
import type { QQAllowConfig } from "../types";

// ============================================================================
// Types
// ============================================================================

/**
 * QQ 命令授权拒绝原因
 */
export type QQDenialReason =
  | "denyFrom"
  | "policy_deny"
  | "not_in_allowlist"
  | "default_deny";

/**
 * QQ 命令授权匹配来源
 */
export type QQMatchedBy =
  | "channel_allowFrom"
  | "commands_qq"
  | "commands_wildcard"
  | "policy_allow";

/**
 * QQ 命令授权结果
 */
export interface QQCommandAuthorization {
  /** QQ 频道标识 */
  providerId: "qq";
  /** Owner 列表 */
  ownerList: string[];
  /** 发送者 ID */
  senderId: string;
  /** 发送者是否是 Owner */
  senderIsOwner: boolean;
  /** 是否授权 */
  isAuthorizedSender: boolean;
  /** 来源地址 */
  from?: string;
  /** 目标地址 */
  to?: string;
  /** 拒绝原因（如果被拒绝） */
  denialReason?: QQDenialReason;
  /** 授权匹配来源（如果被授权） */
  matchedBy?: QQMatchedBy;
}

/**
 * resolveQQCommandAuthorization 参数
 */
export interface ResolveQQCommandAuthorizationParams {
  /** 发送者 ID */
  senderId: string;
  /** 来源地址 */
  from?: string;
  /** 目标地址 */
  to?: string;
  /** OpenClaw 全局配置 */
  cfg: OpenClawConfig;
  /** QQ 频道配置 (群组或私聊) */
  qqConfig: QQAllowConfig;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 检查发送者是否在 allowFrom 列表中
 */
function isSenderInList(senderId: string, allowFrom: string[] | undefined): boolean {
  if (!allowFrom || allowFrom.length === 0) return false;
  return allowFrom.includes(senderId);
}

/**
 * 检查全局 commands.allowFrom 配置
 * 返回: { authorized: boolean, matchedBy: QQMatchedBy | undefined }
 */
function checkGlobalCommandsAllowFrom(
  senderId: string,
  cfg: OpenClawConfig
): { authorized: boolean; matchedBy: QQMatchedBy | undefined } {
  const commandsAllowFrom = cfg.commands?.allowFrom;
  if (!commandsAllowFrom || typeof commandsAllowFrom !== "object") {
    return { authorized: false, matchedBy: undefined };
  }

  // 检查 commands.allowFrom.qq
  const qqList = commandsAllowFrom["qq"];
  if (Array.isArray(qqList) && qqList.includes(senderId)) {
    return { authorized: true, matchedBy: "commands_qq" };
  }

  // 检查 commands.allowFrom["*"]
  const globalList = commandsAllowFrom["*"];
  if (Array.isArray(globalList) && globalList.includes(senderId)) {
    return { authorized: true, matchedBy: "commands_wildcard" };
  }

  return { authorized: false, matchedBy: undefined };
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * 解析 QQ 频道命令授权
 *
 * 使用三明治模式整合 QQ 特有配置与 OpenClaw 全局授权系统
 */
export function resolveQQCommandAuthorization(
  params: ResolveQQCommandAuthorizationParams
): QQCommandAuthorization {
  const { senderId, from, to, cfg, qqConfig } = params;

  // ============================================================
  // 第一层: 预处理 (QQ 特有的"硬拒绝"规则)
  // ============================================================

  // Level 1: denyFrom 黑名单 (绝对拒绝，不可被任何规则覆盖)
  if (isSenderInList(senderId, qqConfig.denyFrom)) {
    log.info(
      "auth",
      `Authorization denied for user ${senderId}: in denyFrom list`
    );
    return {
      providerId: "qq",
      ownerList: [],
      senderId,
      senderIsOwner: false,
      isAuthorizedSender: false,
      from,
      to,
      denialReason: "denyFrom",
    };
  }

  // Level 2: policy='deny' (频道级全局拒绝)
  if (qqConfig.policy === "deny") {
    log.info(
      "auth",
      `Authorization denied for user ${senderId}: channel policy is deny`
    );
    return {
      providerId: "qq",
      ownerList: [],
      senderId,
      senderIsOwner: false,
      isAuthorizedSender: false,
      from,
      to,
      denialReason: "policy_deny",
    };
  }

  // ============================================================
  // 第二层: 频道级 allowFrom (最高优先级授权)
  // 这一层优先于 SDK，符合"最小权限原则"
  // ============================================================

  // Level 3: 频道级 allowFrom 白名单
  if (qqConfig.allowFrom?.length && qqConfig.allowFrom.includes(senderId)) {
    log.debug(
      "auth",
      `Authorization granted for user ${senderId}: in channel allowFrom`
    );
    return {
      providerId: "qq",
      ownerList: qqConfig.allowFrom,
      senderId,
      senderIsOwner: true,
      isAuthorizedSender: true,
      from,
      to,
      matchedBy: "channel_allowFrom",
    };
  }

  // ============================================================
  // 第三层: 全局 commands.allowFrom 检查
  // 处理 commands.allowFrom.qq, commands.allowFrom["*"]
  // ============================================================

  const globalAuth = checkGlobalCommandsAllowFrom(senderId, cfg);
  if (globalAuth.authorized) {
    log.debug(
      "auth",
      `Authorization granted for user ${senderId}: via ${globalAuth.matchedBy}`
    );

    // 获取 owner 列表
    const commandsAllowFrom = cfg.commands?.allowFrom;
    const ownerList =
      globalAuth.matchedBy === "commands_qq"
        ? (commandsAllowFrom?.["qq"] as string[])
        : (commandsAllowFrom?.["*"] as string[]);

    return {
      providerId: "qq",
      ownerList: ownerList || [],
      senderId,
      senderIsOwner: true,
      isAuthorizedSender: true,
      from,
      to,
      matchedBy: globalAuth.matchedBy,
    };
  }

  // ============================================================
  // 第四层: 后处理 (QQ 特有的覆盖规则)
  // ============================================================

  // Level 6: policy='allow' (频道级全局允许)
  if (qqConfig.policy === "allow") {
    log.debug(
      "auth",
      `Authorization granted for user ${senderId}: channel policy is allow`
    );
    return {
      providerId: "qq",
      ownerList: [],
      senderId,
      senderIsOwner: false,
      isAuthorizedSender: true,
      from,
      to,
      matchedBy: "policy_allow",
    };
  }

  // Level 7: policy='allowlist' 但未匹配 allowFrom
  if (qqConfig.policy === "allowlist") {
    log.info(
      "auth",
      `Authorization denied for user ${senderId}: not in allowlist`
    );
    return {
      providerId: "qq",
      ownerList: [],
      senderId,
      senderIsOwner: false,
      isAuthorizedSender: false,
      from,
      to,
      denialReason: "not_in_allowlist",
    };
  }

  // Level 8: 默认拒绝
  log.info(
    "auth",
    `Authorization denied for user ${senderId}: no matching authorization rule`
  );
  return {
    providerId: "qq",
    ownerList: [],
    senderId,
    senderIsOwner: false,
    isAuthorizedSender: false,
    from,
    to,
    denialReason: "default_deny",
  };
}

// ============================================================================
// Utility Functions for dispatch.ts
// ============================================================================

/**
 * 根据 chatType 获取对应的 QQ 配置
 */
export function getQQConfigByChatType(
  isGroup: boolean,
  groupId: string | undefined,
  config: { messageDirect: QQAllowConfig; messageGroup: QQAllowConfig; messageGroupsCustom: Record<string, QQAllowConfig> }
): QQAllowConfig {
  if (!isGroup) {
    return config.messageDirect;
  }

  // 检查是否有特定群组配置
  if (groupId && config.messageGroupsCustom[groupId]) {
    // 合并全局群组配置和特定群组配置（特定配置优先）
    return {
      ...config.messageGroup,
      ...config.messageGroupsCustom[groupId],
    };
  }

  return config.messageGroup;
}
