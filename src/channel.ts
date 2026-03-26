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
import type { ChannelConfiguredBindingConversationRef, ChannelConfiguredBindingMatch } from "openclaw/plugin-sdk";
import { eventListener, sendMsg, getStatus, getLoginInfo, getFriendList, getGroupList } from "./core/request.js"
import { buildMediaMessage, Logger as log, markdownToText } from "./utils";
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

/**
 * 规范化 QQ conversationId
 * 支持格式:
 * - private:xxx (私聊)
 * - group:xxx (群聊)
 * - 纯数字 (默认视为私聊)
 *
 * 返回规范化后的 conversationId 和可选的 parentConversationId
 */
function normalizeQQConversationId(conversationId: string): ChannelConfiguredBindingConversationRef | null {
  if (!conversationId) return null;

  const trimmed = conversationId.trim();

  // 支持 private:xxx 格式
  if (trimmed.startsWith("private:")) {
    return {
      conversationId: trimmed.toLowerCase(),
    };
  }

  // 支持 group:xxx 格式
  if (trimmed.startsWith("group:")) {
    return {
      conversationId: trimmed.toLowerCase(),
    };
  }

  // 纯数字格式，默认视为私聊
  if (/^\d+$/.test(trimmed)) {
    return {
      conversationId: `private:${trimmed}`,
    };
  }

  // 其他格式，尝试保持原样
  return {
    conversationId: trimmed.toLowerCase(),
  };
}

async function getFriends(accountId: string): Promise<ChannelDirectoryEntry[]> {
  const friendList = await getFriendList(accountId);
  log.debug('directory', `friendList: ${JSON.stringify(friendList.data)}`);
  return (friendList.data || []).map((friend: GetFriendListResp) => ({
    kind: "user",
    id: friend.user_id.toString(),
    name: friend.nickname,
  }));
}

async function getGroups(accountId: string): Promise<ChannelDirectoryEntry[]> {
  const groupList = await getGroupList(accountId);
  log.debug('directory', `groupList: ${JSON.stringify(groupList.data)}`);
  return (groupList.data || []).map((group: GetGroupListResp) => ({
    kind: "group",
    id: group.group_id.toString(),
    name: group.group_name,
  }));
}

async function loadLoginInfo(accountId: string) {
  // 获取登录信息
  const info = await getLoginInfo(accountId);
  if (info.data) {
    setLoginInfo(accountId, {
      userId: info.data.user_id.toString(),
      nickname: info.data.nickname,
    })
  }
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
  const resolvedAccountId = account.accountId;

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

  const response = await sendMsg(resolvedAccountId, {
    message_type: chatType,
    user_id: chatType === "private" ? chatId : undefined,
    group_id: chatType === "group" ? chatId : undefined,
    message: await outboundMessageAdapter(content, account),
  })

  if (response.status === "ok" && response.data) {
    const { message_id } = response.data;
    log.debug("outbound", `send successfully, messageId: ${message_id}`);
    return {
      channel: QQ_CHANNEL,
      messageId: message_id.toString(),
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
        defaultAccountId: (cfg) => {
          const ids = listQQAccountIds(cfg);
          return ids.length > 0 ? ids[0] : DEFAULT_ACCOUNT_ID;
        },
        clearBaseFields: ["name"],
        resolveAllowFrom: (account) => account.messageDirect.allowFrom,
        formatAllowFrom: (allowFrom) => formatNormalizedAllowFromEntries({
          allowFrom,
          normalizeEntry: formatAllowFromEntry,
        }),
      }),
      isConfigured: (account) => !!account.wsUrl?.trim(),
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
      probeAccount: async ({ account }) => {
        const status = await getStatus(account.accountId);
        log.debug('gateway', `Probe status: ${status.status}`)
        return {
          ok: status.status === "ok",
          status: status.retcode,
          error: status.status === "failed" ? status.msg : null,
        }
      },
      resolveAccountSnapshot: ({ account }) => ({
        accountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
        name: account.agentId ? `QQ (${account.agentId})` : "QQ",
        enabled: account.enabled,
        configured: Boolean(account.wsUrl?.trim()),
      })
    }),
    gateway: {
      startAccount: async (ctx) => {
        const account = ctx.account;
        const accountId = account.accountId;
        const statusSink = createAccountStatusSink({
          accountId: accountId,
          setStatus: ctx.setStatus,
        });
        log.info('gateway', `[${accountId}] Starting QQ Chat`);

        statusSink({
          running: true,
          lastStartAt: Date.now(),
        });

        await runPassiveAccountLifecycle({
          abortSignal: ctx.abortSignal,
          start: async () => {
            const connection = new ConnectionManager(accountId, account);
            onEvent(ctx.cfg, account, connection, statusSink);
            await connection.start();
            setConnection(accountId, connection);
            await loadLoginInfo(accountId);
            log.info('gateway', `[${accountId}] Started gateway`);
          },
          stop: async () => {
            const connection = getConnection(accountId);
            if (connection) {
              await connection.stop();
              clearConnection(accountId)
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
      self: async ({ accountId }) => {
        const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
        const info = await getLoginInfo(resolvedAccountId);
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
      listPeers: async ({ accountId }) => getFriends(accountId ?? DEFAULT_ACCOUNT_ID),
      listPeersLive: async ({ accountId }) => getFriends(accountId ?? DEFAULT_ACCOUNT_ID),
      listGroups: async ({ accountId }) => getGroups(accountId ?? DEFAULT_ACCOUNT_ID),
      listGroupsLive: async ({ accountId }) => getGroups(accountId ?? DEFAULT_ACCOUNT_ID),
    }),
    security: {},

    // Agent 绑定适配器
    // 支持将 QQ 账号绑定到指定的 Agent
    bindings: {
      /**
       * 编译配置的绑定
       * 将 binding 中的 conversationId 规范化为统一的格式
       * QQ 的 conversationId 格式: private:xxx 或 group:xxx
       */
      compileConfiguredBinding: (params: {
        binding: { match: { peer?: { id?: string } } };
        conversationId: string;
      }): ChannelConfiguredBindingConversationRef | null => {
        const conversationId = params.conversationId;
        if (!conversationId) return null;

        // 规范化 conversationId
        // 支持格式: private:xxx, group:xxx, 或直接 xxx
        const normalized = normalizeQQConversationId(conversationId);
        if (!normalized) return null;

        return {
          conversationId: normalized.conversationId,
          parentConversationId: normalized.parentConversationId,
        };
      },

      /**
       * 匹配入站消息
       * 检查入站消息是否匹配已编译的绑定
       */
      matchInboundConversation: (params: {
        binding: { match: { peer?: { id?: string } } };
        compiledBinding: ChannelConfiguredBindingConversationRef;
        conversationId: string;
        parentConversationId?: string;
      }): ChannelConfiguredBindingMatch | null => {
        const { compiledBinding, conversationId, parentConversationId } = params;

        // 规范化入站消息的 conversationId
        const normalized = normalizeQQConversationId(conversationId);
        if (!normalized) return null;

        // 检查是否匹配编译后的绑定
        const inboundConversationId = normalized.conversationId;
        const inboundParentId = normalized.parentConversationId;

        // 精确匹配 conversationId
        if (compiledBinding.conversationId === inboundConversationId) {
          // 如果绑定有 parentConversationId，也需要检查
          if (compiledBinding.parentConversationId) {
            if (compiledBinding.parentConversationId === inboundParentId ||
              compiledBinding.parentConversationId === parentConversationId) {
              return {
                conversationId: inboundConversationId,
                parentConversationId: inboundParentId,
                matchPriority: 10,
              };
            }
            // parent 不匹配
            return null;
          }
          // 没有父级要求，直接匹配成功
          return {
            conversationId: inboundConversationId,
            parentConversationId: inboundParentId,
            matchPriority: 10,
          };
        }

        return null;
      },
    },
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