/**
 * QQ NapCat CLI Onboarding Adapter
 *
 * 提供 openclaw onboard 命令的交互式配置支持
 */
import type { ChannelOnboardingAdapter } from "openclaw/plugin-sdk"
import { CHANNEL_ID, resolveQQAccount } from "./core/config.js";
import type { QQConfig } from "./types"

/**
 * QQ NapCat Onboarding Adapter
 */
export const qqOnboardingAdapter: ChannelOnboardingAdapter = {
  channel: CHANNEL_ID,
  getStatus: async (ctx) => {
    const { cfg } = ctx;
    const config = cfg.channels?.[CHANNEL_ID] as QQConfig;
    const configured = Boolean(config.wsUrl);

    return {
      channel: CHANNEL_ID,
      configured,
      statusLines: configured
        ? ["QQ (NapCat): 已配置"]
        : ["QQ (NapCat): 未配置"],
      selectionHint: configured ? "已配置" : "未配置",
      quickstartScore: configured ? 1 : 10,
    };
  },
  configure: async (ctx) => {
    const { cfg, prompter } = ctx;

    let next = cfg;
    const resolvedAccount = resolveQQAccount({ cfg });
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
            initialValue: resolvedAccount.wsUrl,
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
    }

    // 应用配置
    if (wsUrl) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          qq: {
            ...next.channels?.[CHANNEL_ID] as QQConfig,
            enabled: true,
            wsUrl,
            ...(accessToken ? { accessToken } : {}),
          },
        },
      };
    }

    return { cfg: next };
  },

  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      qq: {
        ...cfg.channels?.[CHANNEL_ID] as QQConfig,
        enabled: false,
      }
    },
  }),
};
