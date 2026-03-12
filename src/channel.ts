/**
 * QQ NapCat Plugin for OpenClaw
 * Main plugin entry point
 */

import type { ChannelPlugin, ChannelOutboundContext, ChannelDirectoryEntry, OpenClawConfig } from "openclaw/plugin-sdk";
import {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  setAccountEnabledInConfigSection,
  deleteAccountFromConfigSection,
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId
} from "openclaw/plugin-sdk";
import type {
  QQConfig,
  ConnectionStatus,
  OutboundDeliveryResult,
  OpenClawMessage,
  QQProbe,
  GetFriendListResp, GetGroupListResp
} from "./types";
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
  clearConnection,
  setLoginInfo,
  getContext
} from "./core/runtime.js";
import { ConnectionManager } from "./core/connection.js";
import { openClawToNapCatMessage } from "./adapters/message.js";
import {
  listQQAccountIds,
  resolveQQAccount,
  QQConfigSchema, CHANNEL_ID
} from "./core/config.js";
import { eventListener, sendMsg, getStatus, getLoginInfo, getFriendList, getGroupList } from "./core/request.js"
import { qqOnboardingAdapter } from "./onboarding.js";

export const qqPlugin: ChannelPlugin<QQConfig> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "QQ",
    selectionLabel: "QQ",
    docsPath: "extensions/qq",
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
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg,
        channelKey: "qq",
        accountId,
        name,
      }),
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "qq",
        accountId,
        name: input.name,
      });
      const next = accountId !== DEFAULT_ACCOUNT_ID ? migrateBaseNameToDefaultAccount({
        cfg: namedConfig,
        channelKey: "qq",
      }) : namedConfig;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            qq: {
              ...next.channels?.["qq"],
              enabled: true,
            },
          },
        } as OpenClawConfig;
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          qq: {
            ...next.channels?.["qq"],
            enabled: true,
            accounts: {
              ...next.channels?.["qq"]?.accounts,
              [accountId]: {
                ...next.channels?.["qq"]?.accounts?.[accountId],
                enabled: true,
              },
            },
          },
        },
      } as OpenClawConfig;
    }
  },
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
      running: false,
      connected: false,
      reconnectAttempts: 0,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async (): Promise<QQProbe> => {
      const status = await getStatus();
      log.debug('gateway', `Probe status: ${status.status}`)
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
        enabled: account.enabled,
        configured: Boolean(account.wsUrl?.trim()),
        linked: Boolean(account.wsUrl?.trim()),
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

      log.debug('gateway', `Starting gateway`);

      // 检查是否已存在连接
      const existingConnection = getConnection();
      if (existingConnection) {
        log.debug('gateway', `A connection is already running`);
        return;
      }

      // Create new connection manager
      const connection = new ConnectionManager(account);

      connection.on("event", (event) => eventListener(event));
      connection.on("state-changed", (status: ConnectionStatus) => {
        log.info('gateway', `State: ${status.state}`);
        if (status.state === "connected") {
          setContextStatus({ connected: true, lastConnectedAt: Date.now(), });
        } else if (status.state === "disconnected" || status.state === "failed") {
          setContextStatus({ connected: false, lastError: status.error, });
        }
      });
      connection.on("reconnecting", (info: { reason: string; totalAttempts: number }) => {
        log.info('gateway', `Reconnecting: ${info.reason}, attempt ${info.totalAttempts}`);
        setContextStatus({ lastError: `Reconnecting (${info.reason})`, reconnectAttempts: info.totalAttempts, });
      });

      try {
        await connection.start();
        setConnection(connection);
        // 获取登录信息
        const info = await getLoginInfo();
        if (info.data) {
          setLoginInfo({
            userId: info.data.user_id.toString(),
            nickname: info.data.nickname,
          })
        }
        // Update start time
        setContextStatus({
          lastStartAt: Date.now(),
        });
        log.info('gateway', `Started gateway`);
      } catch (error) {
        log.error('gateway', `Failed to start gateway:`, error);
        setContextStatus({
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
        lastStopAt: Date.now(),
      });
      clearContext()
    },
  },
  directory: {
    self: async () => {
      const info = await getLoginInfo();
      if (!info.data) {
        return null
      }
      log.debug('directory', `self: ${JSON.stringify(info.data)}`);
      return {
        kind: "user",
        id: info.data.user_id.toString(),
        name: info.data.nickname,
      };
    },
    listPeers: getFriends,
    listPeersLive: getFriends,
    listGroups: getGroups,
    listGroupsLive: getGroups,
  },
  heartbeat: {
    checkReady: async ({ cfg }) => {
      const account = resolveQQAccount({ cfg });
      if (!account.wsUrl) {
        return { ok: false, reason: "not-configured" };
      }
      const connection = getConnection();
      if (!connection?.isConnected) {
        return { ok: false, reason: "not-connected" };
      }
      return { ok: true, reason: "ok" };
    },
  },
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

  const context = getContext();
  if (!context) {
    log.warn('dispatch', `No gateway context`);
    return {
      channel: CHANNEL_ID,
      messageId: "",
      error: new Error(`No gateway context`),
      deliveredAt: Date.now(),
    }
  }

  if (text) {
    content.push({ type: "text", text: context.account.markdownFormat ? markdownToText(text) : text })
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

async function getFriends(): Promise<ChannelDirectoryEntry[]> {
  const friendList = await getFriendList();
  log.debug('directory', `friendList: ${JSON.stringify(friendList.data)}`);
  return (friendList.data || []).map((friend: GetFriendListResp) => ({
    kind: "user",
    id: friend.user_id.toString(),
    name: friend.nickname,
  }));
}

async function getGroups(): Promise<ChannelDirectoryEntry[]> {
  const groupList = await getGroupList();
  log.debug('directory', `groupList: ${JSON.stringify(groupList.data)}`);
  return (groupList.data || []).map((group: GetGroupListResp) => ({
    kind: "group",
    id: group.group_id.toString(),
    name: group.group_name,
  }));
}
