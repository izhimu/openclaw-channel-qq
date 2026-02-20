/**
 * QQ NapCat Plugin for OpenClaw
 * Main plugin entry point
 */

import type { ChannelPlugin, ChannelOutboundContext } from "openclaw/plugin-sdk";
import {
  buildChannelConfigSchema,
  setAccountEnabledInConfigSection,
  deleteAccountFromConfigSection,
  DEFAULT_ACCOUNT_ID
} from "openclaw/plugin-sdk";
import type { QQConfig, ConnectionStatus, OutboundDeliveryResult, OpenClawMessage, QQProbe } from "./types";
import {
  messageIdToString,
  markdownToText,
  buildMediaMessage,
  Logger as log
} from "./utils/index.js";
import {
  setContext,
  setContextStatus,
  clearContext,
  setConnection,
  getConnection,
  clearConnection
} from "./core/runtime.js";
import { ConnectionManager } from "./core/connection.js";
import { openClawToNapCatMessage } from "./adapters/message.js";
import {
  listQQAccountIds,
  resolveQQAccount,
  QQConfigSchema, CHANNEL_ID
} from "./core/config.js";
import { eventListener, sendMsg, getStatus } from "./core/request.js"
import { qqOnboardingAdapter } from "./onboarding.js";

export const qqPlugin: ChannelPlugin<QQConfig> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "QQ",
    selectionLabel: "QQ",
    docsPath: "/channels/qq",
    blurb: "通过 NapCat WebSocket 连接 QQ 机器人",
    quickstartAllowFrom: true,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: true,
    reply: true,
    media: true,
    blockStreaming: true,
  },
  reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
  onboarding: qqOnboardingAdapter,
  config: {
    listAccountIds: (cfg) => listQQAccountIds(cfg),
    resolveAccount: (cfg) => resolveQQAccount({ cfg }),
    isEnabled: (account) => Boolean(account?.enabled),
    isConfigured: (account) => Boolean(account?.wsUrl),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "qq",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "qq",
        accountId,
      }),
  },
  configSchema: buildChannelConfigSchema(QQConfigSchema),
  messaging: {
    normalizeTarget: (target: string) => {
      return target.replace(/^qq:/i, "");
    },
    targetResolver: {
      looksLikeId: (id: string) => {
        const normalized = id.replace(/^qq:/i, "");
        // 支持 private:xxx, group:xxx 格式
        if (normalized.startsWith("private:") || normalized.startsWith("group:")) return true;
        // 支持纯数字QQ号或群号
        return /^\d+$/.test(normalized);
      },
      hint: "private:<qqId> or group:<groupId>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: outboundSend,
    sendMedia: outboundSend,
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      name: "QQ",
      enabled: false,
      configured: false,
      linked: false,
      running: false,
      connected: false,
      reconnectAttempts: 0,
      lastConnectedAt: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      enabled: snapshot.enabled ?? false,
      configured: snapshot.configured ?? false,
      linked: snapshot.linked ?? false,
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      reconnectAttempts: snapshot.reconnectAttempts ?? 0,
      lastConnectedAt: snapshot.lastConnectedAt ?? null,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      lastInboundAt: snapshot.lastInboundAt ?? null,
      lastOutboundAt: snapshot.lastOutboundAt ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,

    }),
    probeAccount: async (): Promise<QQProbe> => {
      const status = await getStatus();
      setContextStatus({
        lastProbeAt: Date.now(),
      });
      return {
        ok: status.status === "ok",
        status: status.retcode,
        error: status.status === "failed" ? status.msg : null,
      }
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => {
      return {
        accountId: DEFAULT_ACCOUNT_ID,
        name: "QQ",
        enabled: account.enabled ?? false,
        configured: Boolean(account.wsUrl?.trim()),
        linked: runtime?.linked ?? false,
        running: runtime?.running ?? false,
        connected: runtime?.connected ?? false,
        reconnectAttempts: runtime?.reconnectAttempts ?? 0,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        probe,
        lastProbeAt: runtime?.lastProbeAt ?? null,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      setContext(ctx)
      const { account } = ctx

      log.info('gateway', `Starting gateway`);

      // 检查是否已存在连接
      const existingConnection = getConnection();
      if (existingConnection) {
        log.warn('gateway', `A connection is already running`);
        return;
      }

      // Create new connection manager
      const connection = new ConnectionManager(account);

      connection.on("event", (event) => eventListener(event));
      connection.on("state-changed", (status: ConnectionStatus) => {
        log.info('gateway', `State: ${status.state}`);
        if (status.state === "connected") {
          setContextStatus({
            linked: true,
            connected: true,
            lastConnectedAt: Date.now(),
          });
        } else if (status.state === "disconnected" || status.state === "failed") {
          setContextStatus({
            linked: false,
            connected: false,
            lastError: status.error,
          });
        }
      });
      connection.on("reconnecting", (info: { reason: string; totalAttempts: number }) => {
        log.info('gateway', `Reconnecting: ${info.reason}, attempt ${info.totalAttempts}`);
        setContextStatus({
          linked: false,
          connected: false,
          lastError: `Reconnecting (${info.reason})`,
          reconnectAttempts: info.totalAttempts,
        });
      });

      try {
        await connection.start();
        setConnection(connection);
        // Update start time
        setContextStatus({
          running: true,
          linked: true,
          connected: true,
          lastStartAt: Date.now(),
        });
        log.info('gateway', `Started gateway`);
      } catch (error) {
        log.error('gateway', `Failed to start gateway:`, error);
        setContextStatus({
          running: false,
          linked: false,
          connected: false,
          lastError: error instanceof Error ? error.message : 'Failed to start gateway',
        });
        throw error;
      }
    },
    stopAccount: async (_ctx) => {
      const connection = getConnection();

      if (connection) {
        await connection.stop();
        clearConnection()
      }

      setContextStatus({
        running: false,
        linked: false,
        connected: false,
        lastStopAt: Date.now(),
      });
      clearContext()
    },
  }
};

async function outboundSend(ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> {
  const { to, text, mediaUrl, accountId, replyToId } = ctx;

  log.debug("outbound", `send called - accountId: ${accountId}, to: ${to}, mediaUrl: ${mediaUrl ?? "null"}, replyToId: ${replyToId ?? "none"}`);

  // Parse target (format: private:xxx or group:xxx)
  const parts = to.split(":");
  const [type, id] = parts.length > 1 ? parts : ["private", to];
  const chatType = type === "group" ? "group" : "private";
  const chatId = id || to;

  const content: OpenClawMessage[] = []

  if (text) {
    content.push({ type: "text", text: markdownToText(text) })
  }
  if (mediaUrl) {
    content.push(buildMediaMessage(mediaUrl))
  }
  if (replyToId) {
    content.push({ type: "reply", messageId: replyToId })
  }

  if (content.length === 0) {
    log.warn("outbound", `send called with no content - accountId: ${accountId}, to: ${to}, mediaUrl: ${mediaUrl ?? "null"}, replyToId: ${replyToId ?? "none"}`);
    return {
      channel: CHANNEL_ID,
      messageId: "",
      error: new Error(`No content to send`),
      deliveredAt: Date.now(),
    }
  }

  const response = await sendMsg({
    message_type: chatType,
    user_id: chatType === "private" ? chatId : undefined,
    group_id: chatType === "group" ? chatId : undefined,
    message: openClawToNapCatMessage(content),
  })

  if (response.status === "ok" && response.data) {
    setContextStatus({ lastOutboundAt: Date.now() })
    const data = response.data as { message_id: number };
    log.debug("outbound", `send successfully, messageId: ${data.message_id}`);
    return {
      channel: CHANNEL_ID,
      messageId: messageIdToString(data.message_id),
      deliveredAt: Date.now(),
    };
  } else {
    log.warn("outbound", `send failed, status: ${response.status}, retcode: ${response.retcode}, msg: ${response.msg ?? "none"}`);
    return {
      channel: CHANNEL_ID,
      messageId: "",
      error: new Error(response.msg || "Send failed"),
      deliveredAt: Date.now(),
    };
  }
}
