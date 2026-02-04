/**
 * QQ NapCat CLI Onboarding Adapter
 *
 * 提供 openclaw onboard 命令的交互式配置支持
 */
import { listQQNapCatAccountIds, resolveQQNapCatAccount } from "./core/config.js";

const DEFAULT_ACCOUNT_ID = "default";

// 内部类型（避免循环依赖）
interface MoltbotConfig {
  channels?: {
    "openclaw-channel-qq"?: QQNapCatChannelConfig;
    qq?: QQNapCatChannelConfig;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface QQNapCatChannelConfig {
  enabled?: boolean;
  wsUrl?: string;
  accessToken?: string;
  name?: string;
  accounts?: Record<string, {
    enabled?: boolean;
    wsUrl?: string;
    accessToken?: string;
    name?: string;
  }>;
}

/**
 * 解析默认账户 ID
 */
function resolveDefaultQQNapCatAccountId(cfg: MoltbotConfig): string {
  const ids = listQQNapCatAccountIds(cfg);
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

/**
 * QQ NapCat Onboarding Adapter
 */
export const qqNapCatOnboardingAdapter: any = {
  channel: "openclaw-channel-qq",

  getStatus: async (ctx: any) => {
    const { cfg } = ctx;
    const configured = listQQNapCatAccountIds(cfg as MoltbotConfig).some((accountId: string) => {
      const account = resolveQQNapCatAccount(cfg as MoltbotConfig, accountId);
      return Boolean(account.wsUrl);
    });

    return {
      channel: "openclaw-channel-qq",
      configured,
      statusLines: configured
        ? ["QQ (NapCat): 已配置"]
        : ["QQ (NapCat): 需要 NapCat WebSocket URL"],
      selectionHint: configured ? "已配置" : "支持 QQ 群聊和私聊",
      quickstartScore: configured ? 1 : 10,
    };
  },

  configure: async (ctx: any) => {
    const { cfg, prompter, accountOverrides, shouldPromptAccountIds } = ctx;
    const moltbotCfg = cfg as MoltbotConfig;

    const override = (accountOverrides as Record<string, string>)["openclaw-channel-qq"]?.trim()
      || (accountOverrides as Record<string, string>).qq?.trim();
    const defaultAccountId = resolveDefaultQQNapCatAccountId(moltbotCfg);
    let accountId = override ?? defaultAccountId;

    // 是否需要提示选择账户
    if (shouldPromptAccountIds && !override) {
      const existingIds = listQQNapCatAccountIds(moltbotCfg);
      if (existingIds.length > 1) {
        accountId = await prompter.select({
          message: "选择 QQ NapCat 账户",
          options: existingIds.map((id: string) => ({
            value: id,
            label: id === DEFAULT_ACCOUNT_ID ? "默认账户" : id,
          })),
          initialValue: accountId,
        });
      }
    }

    let next = moltbotCfg;
    const resolvedAccount = resolveQQNapCatAccount(next, accountId);
    const accountConfigured = Boolean(resolvedAccount.wsUrl);

    // 显示帮助
    if (!accountConfigured) {
      await prompter.note(
        [
          "1) 确保已安装 NapCat: https://github.com/NapNeko/NapCatQQ",
          "2) 在 NapCat 配置中启用 WebSocket (正向 WS)",
          "3) 默认地址: ws://localhost:3001",
          "4) 如需访问控制，可设置 accessToken",
          "",
          "NapCat 文档: https://napneko.github.io/",
        ].join("\n"),
        "QQ NapCat 配置",
      );
    }

    let wsUrl: string | null = null;
    let accessToken: string | null = null;
    let name: string | null = null;

    // 检查是否已配置
    if (accountConfigured) {
      const keep = await prompter.confirm({
        message: "QQ NapCat 已配置，是否保留当前配置？",
        initialValue: true,
      });
      if (!keep) {
        wsUrl = String(
          await prompter.text({
            message: "请输入 NapCat WebSocket URL",
            placeholder: "ws://localhost:3001",
            initialValue: resolvedAccount.wsUrl || undefined,
            validate: (value: string) => (value?.trim() ? undefined : "WebSocket URL 不能为空"),
          }),
        ).trim();
        accessToken = String(
          await prompter.text({
            message: "请输入 Access Token (可选，直接回车跳过)",
            placeholder: "留空表示不使用 token",
            initialValue: resolvedAccount.accessToken || undefined,
          }),
        ).trim();
        name = String(
          await prompter.text({
            message: "请输入账户显示名称 (可选)",
            placeholder: "例如: 我的 QQ 机器人",
            initialValue: resolvedAccount.name || undefined,
          }),
        ).trim();
      }
    } else {
      // 新配置
      wsUrl = String(
        await prompter.text({
          message: "请输入 NapCat WebSocket URL",
          placeholder: "ws://localhost:3001",
          validate: (value: string) => (value?.trim() ? undefined : "WebSocket URL 不能为空"),
        }),
      ).trim();
      accessToken = String(
        await prompter.text({
          message: "请输入 Access Token (可选，直接回车跳过)",
          placeholder: "留空表示不使用 token",
        }),
      ).trim();
      name = String(
        await prompter.text({
          message: "请输入账户显示名称 (可选)",
          placeholder: "例如: 我的 QQ 机器人",
        }),
      ).trim();
    }

    // 应用配置
    if (wsUrl) {
      if (accountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            "openclaw-channel-qq": {
              ...next.channels?.["openclaw-channel-qq"],
              enabled: true,
              wsUrl,
              ...(accessToken ? { accessToken } : {}),
              ...(name ? { name } : {}),
            },
          },
        };
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            "openclaw-channel-qq": {
              ...next.channels?.["openclaw-channel-qq"],
              enabled: true,
              accounts: {
                ...(next.channels?.["openclaw-channel-qq"] as QQNapCatChannelConfig)?.accounts,
                [accountId]: {
                  ...(next.channels?.["openclaw-channel-qq"] as QQNapCatChannelConfig)?.accounts?.[accountId],
                  enabled: true,
                  wsUrl,
                  ...(accessToken ? { accessToken } : {}),
                  ...(name ? { name } : {}),
                },
              },
            },
          },
        };
      }
    }

    return { cfg: next, accountId };
  },

  disable: (cfg: any) => ({
    ...cfg,
    channels: {
      ...(cfg as MoltbotConfig).channels,
      "openclaw-channel-qq": { ...(cfg as MoltbotConfig).channels?.["openclaw-channel-qq"], enabled: false },
    },
  }),
};
