/**
 * QQ NapCat 配置管理
 */

import type { AccountConfig } from "./types.js";

const DEFAULT_ACCOUNT_ID = "default";

interface MoltbotConfig {
  channels?: {
    "qq-napcat"?: QQNapCatChannelConfig;
    qq?: QQNapCatChannelConfig;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface QQNapCatChannelConfig {
  enabled?: boolean;
  name?: string;
  wsUrl?: string;
  accessToken?: string;
  botUserId?: number;
  accounts?: Record<string, Partial<AccountConfig>>;
}

/**
 * 列出所有 QQ NapCat 账户 ID
 */
export function listQQNapCatAccountIds(cfg: MoltbotConfig): string[] {
  const ids = new Set<string>();

  // Check qq-napcat config first
  let napcat = cfg.channels?.["qq-napcat"];
  // Fallback to legacy 'qq' key
  if (!napcat) {
    napcat = cfg.channels?.qq;
  }

  if (napcat?.wsUrl) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }

  if (napcat?.accounts) {
    for (const accountId of Object.keys(napcat.accounts)) {
      if (napcat.accounts[accountId]?.wsUrl) {
        ids.add(accountId);
      }
    }
  }

  return Array.from(ids);
}

/**
 * 解析 QQ NapCat 账户配置
 */
export function resolveQQNapCatAccount(
  cfg: MoltbotConfig,
  accountId?: string | null
): AccountConfig {
  const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;

  // Check qq-napcat config first
  let napcat = cfg.channels?.["qq-napcat"];
  // Fallback to legacy 'qq' key
  if (!napcat) {
    napcat = cfg.channels?.qq;
  }

  let accountConfig: Partial<AccountConfig> = {};

  if (resolvedAccountId === DEFAULT_ACCOUNT_ID) {
    // 默认账户从顶层读取
    accountConfig = {
      enabled: napcat?.enabled,
      name: napcat?.name,
      wsUrl: napcat?.wsUrl,
      accessToken: napcat?.accessToken,
    };
  } else {
    // 命名账户从 accounts 读取
    const account = napcat?.accounts?.[resolvedAccountId];
    accountConfig = account ?? {};
  }

  return {
    accountId: resolvedAccountId,
    name: accountConfig.name,
    enabled: accountConfig.enabled !== false,
    wsUrl: accountConfig.wsUrl ?? "",
    accessToken: accountConfig.accessToken ?? "",
  };
}

/**
 * 应用账户配置
 */
export function applyQQNapCatAccountConfig(
  cfg: MoltbotConfig,
  accountId: string,
  input: { wsUrl?: string; accessToken?: string; name?: string }
): MoltbotConfig {
  const next = { ...cfg };

  if (accountId === DEFAULT_ACCOUNT_ID) {
    next.channels = {
      ...next.channels,
      "qq-napcat": {
        ...next.channels?.["qq-napcat"],
        enabled: true,
        ...(input.wsUrl ? { wsUrl: input.wsUrl } : {}),
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
        ...(input.name ? { name: input.name } : {}),
      },
    };
  } else {
    next.channels = {
      ...next.channels,
      "qq-napcat": {
        ...next.channels?.["qq-napcat"],
        enabled: true,
        accounts: {
          ...(next.channels?.["qq-napcat"] as QQNapCatChannelConfig)?.accounts,
          [accountId]: {
            ...(next.channels?.["qq-napcat"] as QQNapCatChannelConfig)?.accounts?.[accountId],
            enabled: true,
            ...(input.wsUrl ? { wsUrl: input.wsUrl } : {}),
            ...(input.accessToken ? { accessToken: input.accessToken } : {}),
            ...(input.name ? { name: input.name } : {}),
          },
        },
      },
    };
  }

  return next;
}
