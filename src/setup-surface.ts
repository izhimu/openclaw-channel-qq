import { createStandardChannelSetupStatus, applySetupAccountConfigPatch } from "openclaw/plugin-sdk/setup";
import type { ChannelSetupWizard } from "openclaw/plugin-sdk/setup";
import { QQ_CHANNEL, listQQAccountIds, resolveQQAccount } from "./core/config";

export const qqSetupWizard: ChannelSetupWizard = {
  channel: QQ_CHANNEL,
  status: createStandardChannelSetupStatus({
    channelLabel: "QQ Chat",
    configuredLabel: "configured",
    unconfiguredLabel: "needs service account",
    configuredHint: "configured",
    unconfiguredHint: "needs auth",
    includeStatusLine: true,
    resolveConfigured: ({ cfg }) =>
      listQQAccountIds(cfg).some(
        (accountId) => resolveQQAccount({ cfg, accountId }).token !== "none",
      ),
  }),
  introNote: {
    title: "QQ Chat setup",
    lines: [
      "1) 确保已安装 NapCat: https://github.com/NapNeko/NapCatQQ",
      "2) 在 NapCat 配置中启用 WebSocket (正向 WS)",
      "3) 默认地址: ws://localhost:3001",
      "4) 如需访问控制，可设置 token",
      "",
      "NapCat 文档: https://napneko.github.io/",
    ]
  },
  credentials: [],
  textInputs: [
    {
      inputKey: "url",
      message: "请输入 NapCat WebSocket URL",
      placeholder: "ws://localhost:3001",
      shouldPrompt: ({ currentValue }) => !currentValue,
      validate: ({ value }) => (value ? undefined : "Required"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        applySetupAccountConfigPatch({
          cfg,
          channelKey: QQ_CHANNEL,
          accountId,
          patch: {
            wsUrl: value,
          }
        }),
    }, {
      inputKey: "token",
      message: "请输入 Access Token",
      placeholder: "ws://localhost:3001",
      shouldPrompt: ({ currentValue }) => !currentValue,
      validate: ({ value }) => (value ? undefined : "Required"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        applySetupAccountConfigPatch({
          cfg,
          channelKey: QQ_CHANNEL,
          accountId,
          patch: {
            wsUrl: value,
          }
        }),
    }
  ]
}