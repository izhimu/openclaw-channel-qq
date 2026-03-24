import { DEFAULT_ACCOUNT_ID, createChatChannelPlugin, } from "openclaw/plugin-sdk/core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { createPatchedAccountSetupAdapter } from "openclaw/plugin-sdk/setup";
import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import {
  createScopedChannelConfigAdapter,
  adaptScopedAccountAccessor,
} from "openclaw/plugin-sdk/channel-config-helpers";
import { formatNormalizedAllowFromEntries } from "openclaw/plugin-sdk/allow-from";
import { createChannelDirectoryAdapter } from "openclaw/plugin-sdk/directory-runtime";
import type { ChannelDirectoryEntry } from "openclaw/plugin-sdk/directory-runtime";
import type { ChannelOutboundContext, ChannelAccountSnapshot } from "openclaw/plugin-sdk/channel-runtime";
import { createAccountStatusSink, runPassiveAccountLifecycle } from "openclaw/plugin-sdk/channel-lifecycle";
import {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "openclaw/plugin-sdk/status-helpers";
import type {
  ConnectionStatus,
  GetFriendListResp,
  GetGroupListResp,
  OpenClawMessage,
  OutboundDeliveryResult,
  QQAccount,
} from "./types";
import { listQQAccountIds, QQ_CHANNEL, QQConfigSchema, resolveQQAccount } from "./core/config";
import { eventListener, sendMsg, getStatus, getLoginInfo, getFriendList, getGroupList } from "./core/request.js"
import { buildMediaMessage, Logger as log, markdownToText, messageIdToString } from "./utils";
import {
  clearConnection,
  getConnection,
  setConnection,
  setLoginInfo
} from "./core/runtime";
import { outboundMessageAdapter } from "./adapters/message";
import { ConnectionManager } from "./core/connection";
import { qqSetupWizard } from "./setup-surface";
import { createInboundHandler } from "./core/dispatch";
import { getQQRuntime } from "./runtime";

const formatAllowFromEntry = (entry: string) =>
  entry
    .trim()
    .replace(/^(qq):/i, "")
    .toLowerCase();

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

async function outboundSend(ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> {
  const { cfg, to, text, mediaUrl, accountId, replyToId } = ctx;
  log.debug("outbound", `send called - accountId: ${accountId}, to: ${to}, mediaUrl: ${mediaUrl ?? "null"}, replyToId: ${replyToId ?? "none"}`);

  // Parse target (format: private:xxx or group:xxx)
  const parts = to.split(":");
  const [type, id] = parts.length > 1 ? parts : ["private", to];
  const chatType = type === "group" ? "group" : "private";
  const chatId = id || to;

  const content: OpenClawMessage[] = []
  const account = resolveQQAccount({ cfg, accountId });

  if (text) {
    content.push({ type: "text", text: account.markdownFormat ? markdownToText(text) : text })
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
      channel: QQ_CHANNEL,
      messageId: "",
      error: new Error(`No content to send`),
      deliveredAt: Date.now(),
    }
  }

  const response = await sendMsg({
    message_type: chatType,
    user_id: chatType === "private" ? chatId : undefined,
    group_id: chatType === "group" ? chatId : undefined,
    message: await outboundMessageAdapter(content, account),
  })

  if (response.status === "ok" && response.data) {
    const data = response.data as { message_id: number };
    log.debug("outbound", `send successfully, messageId: ${data.message_id}`);
    return {
      channel: QQ_CHANNEL,
      messageId: messageIdToString(data.message_id),
      deliveredAt: Date.now(),
    };
  } else {
    log.warn("outbound", `send failed, status: ${response.status}, retcode: ${response.retcode}, msg: ${response.msg ?? "none"}`);
    return {
      channel: QQ_CHANNEL,
      messageId: "",
      error: new Error(response.msg || "Send failed"),
      deliveredAt: Date.now(),
    };
  }
}

function onEvent(cfg: OpenClawConfig, account: QQAccount, connection: ConnectionManager, statusSink: (patch: Omit<ChannelAccountSnapshot, "accountId">) => void) {
  const handleInbound = createInboundHandler({
    cfg,
    account,
    runtime: getQQRuntime(),
  });
  connection.on("event", (event) => eventListener(account, event, handleInbound));
  connection.on("state-changed", (status: ConnectionStatus) => {
    log.info('gateway', `Connection state: ${status.state}`);
    if (status.state === "connected") {
      statusSink({
        connected: true,
        lastConnectedAt: Date.now(),
      });
    } else if (status.state === "disconnected" || status.state === "failed") {
      statusSink({
        connected: false,
        lastError: status.error,
        lastDisconnect: {
          at: Date.now(),
          error: status.error,
        },
      });
    }
  });
  connection.on("reconnecting", (info: { reason: string; totalAttempts: number }) => {
    log.info('gateway', `Reconnecting: ${info.reason}, attempt ${info.totalAttempts}`);
    statusSink({
      lastError: `Reconnecting (${info.reason})`,
      reconnectAttempts: info.totalAttempts,
    });
  });
}

async function loadLoginInfo() {
  // 获取登录信息
  const info = await getLoginInfo();
  if (info.data) {
    setLoginInfo({
      userId: info.data.user_id.toString(),
      nickname: info.data.nickname,
    })
  }
}

export const qqPlugin = createChatChannelPlugin<QQAccount>({
  base: {
    id: QQ_CHANNEL,
    meta: {
      id: QQ_CHANNEL,
      label: "QQ",
      selectionLabel: "QQ",
      detailLabel: "QQ",
      docsPath: "extensions/qq",
      docsLabel: "qq",
      blurb: "Connect OpenClaw to QQ Chat",
      systemImage: "message",
      quickstartAllowFrom: true,
    },
    capabilities: {
      chatTypes: ["direct", "group"],
      reactions: true,
      reply: true,
      media: true,
      blockStreaming: true,
    },
    reload: { configPrefixes: [`channels.${QQ_CHANNEL}`] },
    config: {
      ...createScopedChannelConfigAdapter({
        sectionKey: QQ_CHANNEL,
        listAccountIds: listQQAccountIds,
        resolveAccount: adaptScopedAccountAccessor(resolveQQAccount),
        defaultAccountId: () => DEFAULT_ACCOUNT_ID,
        clearBaseFields: ["name"],
        resolveAllowFrom: (account) => account.messageDirect.allowFrom,
        formatAllowFrom: (allowFrom) => formatNormalizedAllowFromEntries({
          allowFrom,
          normalizeEntry: formatAllowFromEntry,
        }),
      }),
      isConfigured: (account) => !!account.accessToken?.trim(),
    },
    configSchema: buildChannelConfigSchema(QQConfigSchema),
    setup: createPatchedAccountSetupAdapter({
      channelKey: QQ_CHANNEL,
      validateInput: ({ input }) => {
        if (input.useEnv) {
          return "The use of environment variables is not supported at this time.";
        }
        if (!input.useEnv && !input.token) {
          return "QQ Chat requires token";
        }
        return null;
      },
      buildPatch: (input) =>
        input.token ? { botToken: input.token } : {},
    }),
    setupWizard: qqSetupWizard,
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
    status: createComputedAccountStatusAdapter<QQAccount>({
      defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
      buildChannelSummary: ({ snapshot }) => ({
        configured: snapshot.configured ?? false,
        running: snapshot.running ?? false,
        lastStartAt: snapshot.lastStartAt ?? null,
        lastStopAt: snapshot.lastStopAt ?? null,
        lastError: snapshot.lastError ?? null,
        probe: snapshot.probe,
        lastProbeAt: snapshot.lastProbeAt ?? null,
      }),
      probeAccount: async () => {
        const status = await getStatus();
        log.debug('gateway', `Probe status: ${status.status}`)
        return {
          ok: status.status === "ok",
          status: status.retcode,
          error: status.status === "failed" ? status.msg : null,
        }
      },
      resolveAccountSnapshot: ({ account }) => ({
        accountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
        name: "QQ",
        enabled: account.enabled,
        configured: Boolean(account.wsUrl?.trim()),
      })
    }),
    gateway: {
      startAccount: async (ctx) => {
        const account = ctx.account;
        const statusSink = createAccountStatusSink({
          accountId: account.accountId,
          setStatus: ctx.setStatus,
        });
        log.info('gateway', `Starting QQ Chat`);

        statusSink({
          running: true,
          lastStartAt: Date.now(),
        });

        await runPassiveAccountLifecycle({
          abortSignal: ctx.abortSignal,
          start: async () => {
            const connection = new ConnectionManager(account);
            onEvent(ctx.cfg, account, connection, statusSink);
            await connection.start();
            setConnection(connection);
            await loadLoginInfo();
            log.info('gateway', `Started gateway`);
          },
          stop: async () => {
            const connection = getConnection();
            if (connection) {
              await connection.stop();
              clearConnection()
            }
          },
          onStop: async () => {
            statusSink({
              running: false,
              lastStopAt: Date.now(),
            })
          },
        });
      },
    },
    directory: createChannelDirectoryAdapter({
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
    }),
    security: {},
  },
  outbound: {
    base: {
      deliveryMode: "direct",
    },
    attachedResults: {
      channel: QQ_CHANNEL,
      sendText: outboundSend,
      sendMedia: outboundSend,
    }
  },
})