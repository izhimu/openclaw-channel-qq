/**
 * QQ NapCat Plugin for OpenClaw
 * Main plugin entry point
 */

import type { ChannelPlugin } from "openclaw/plugin-sdk";
import type { AccountConfig, ConnectionStatus } from "./types.js";
import {
  generateMessageId,
  messageIdToString,
  logDebug,
  logWarn,
} from "./utils.js";
import { MultiConnectionManager } from "./connection.js";
import {
  napCatToOpenClawMessage,
  openClawToNapCatMessage,
  getMessageSummary,
} from "./adapters.js";
import {
  listQQNapCatAccountIds,
  resolveQQNapCatAccount,
  applyQQNapCatAccountConfig,
} from "./config.js";

// =============================================================================
// Plugin State
// =============================================================================

let connectionManager: MultiConnectionManager;

// Bot user ID cache for routing
const botUserIds = new Map<string, number>();

// Channel runtime per account
const channelRuntimes = new Map<string, any>();

const DEFAULT_ACCOUNT_ID = "default";

// =============================================================================
// Plugin Definition
// =============================================================================

export const qqNapCatPlugin: ChannelPlugin<AccountConfig> = {
  id: "openclaw-channel-qq",
  meta: {
    id: "openclaw-channel-qq",
    label: "QQ (NapCat)",
    selectionLabel: "QQ NapCat",
    docsPath: "/docs/channels/openclaw-channel-qq",
    blurb: "通过 NapCat WebSocket 连接 QQ 机器人",
    order: 50,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: false,
    reactions: false,
    threads: false,
  },
  reload: { configPrefixes: ["channels.openclaw-channel-qq", "channels.qq"] },

  // 消息目标解析
  messaging: {
    normalizeTarget: (target: string) => {
      // 支持格式: openclaw-channel-qq:private:xxx, openclaw-channel-qq:group:xxx
      return target.replace(/^openclaw-channel-qq:/i, "");
    },
    targetResolver: {
      looksLikeId: (id: string) => {
        const normalized = id.replace(/^openclaw-channel-qq:/i, "");
        // 支持 private:xxx, group:xxx 格式
        if (normalized.startsWith("private:") || normalized.startsWith("group:")) return true;
        // 支持纯数字QQ号或群号
        if (/^\d+$/.test(normalized)) return true;
        return false;
      },
      hint: "private:<qqId> or group:<groupId>",
    },
  },

  config: {
    listAccountIds: (cfg) => listQQNapCatAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveQQNapCatAccount(cfg, accountId),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account) => Boolean(account?.wsUrl),
    describeAccount: (account) => ({
      accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID,
      name: account?.name ?? account?.wsUrl,
      enabled: account?.enabled ?? false,
      configured: Boolean(account?.wsUrl),
    }),
  },

  setup: {
    validateInput: ({ input }: any) => {
      if (!input.wsUrl) {
        return "QQ NapCat requires --ws-url (NapCat WebSocket URL)";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }: any) => {
      return applyQQNapCatAccountConfig(cfg, accountId, {
        wsUrl: input.wsUrl,
        accessToken: input.accessToken ?? "",
        name: input.name,
      });
    },
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 2000,
    sendText: async ({ to, text, accountId, cfg }: any) => {
      const account = resolveQQNapCatAccount(cfg, accountId);
      if (!account) {
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error(`Account not found: ${accountId}`),
        };
      }

      const conn = connectionManager?.getConnection(accountId);
      if (!conn || !conn.isConnected()) {
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error(`Not connected for account: ${accountId}`),
        };
      }

      // Parse target (format: private:xxx or group:xxx)
      const parts = to.split(":");
      const type = parts[0];
      const id = parts[1];
      const chatType = type === "group" ? "group" : "direct";
      const chatId = id || to;

      try {
        const messageSegments = openClawToNapCatMessage([{ type: "text", text }]);

        let response;
        if (chatType === "direct") {
          response = await conn.sendRequest("send_private_msg", {
            user_id: Number(chatId),
            message: messageSegments,
          });
        } else {
          response = await conn.sendRequest("send_group_msg", {
            group_id: Number(chatId),
            message: messageSegments,
          });
        }

        if (response.status === "ok" && response.data) {
          const data = response.data as { message_id: number };
          return {
            channel: "openclaw-channel-qq",
            messageId: messageIdToString(data.message_id),
          };
        } else {
          return {
            channel: "openclaw-channel-qq",
            messageId: "",
            error: new Error(response.msg || "Send failed"),
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error(errorMessage),
        };
      }
    },
  },

  gateway: {
    startAccount: async (ctx: any) => {
      const { account, log } = ctx;

      log?.info(`[openclaw-channel-qq:${account.accountId}] Starting gateway`);

      // Store runtime context
      channelRuntimes.set(account.accountId, ctx);

      // Start connection
      const conn = connectionManager.addConnection(account.accountId, account);

      conn.on("event", handleNapCatEvent);
      conn.on("state-changed", (status: ConnectionStatus) => {
        log?.info(`[openclaw-channel-qq:${account.accountId}] State: ${status.state}`);
        if (status.state === "connected") {
          ctx.setStatus({
            ...ctx.getStatus(),
            running: true,
            connected: true,
            lastConnectedAt: Date.now(),
          });
        }
      });
      conn.on("account-connected", () => {
        log?.info(`[openclaw-channel-qq:${account.accountId}] Gateway ready`);
      });
      conn.on("account-failed", (error: string) => {
        log?.warn(`[openclaw-channel-qq:${account.accountId}] Gateway failed: ${error}`);
        ctx.setStatus({
          ...ctx.getStatus(),
          lastError: error,
        });
      });

      await conn.start();
    },
    stopAccount: async (ctx: any) => {
      const { account } = ctx;
      const conn = connectionManager?.getConnection(account.accountId);
      if (conn) {
        await conn.stop();
      }
      channelRuntimes.delete(account.accountId);
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastError: null,
    },
    buildAccountSnapshot: ({ account, runtime }: any) => ({
      accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID,
      name: account?.name ?? account?.wsUrl,
      enabled: account?.enabled ?? false,
      configured: Boolean(account?.wsUrl),
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastConnectedAt: runtime?.lastConnectedAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },
};

// =============================================================================
// Event Handling
// =============================================================================

async function handleNapCatEvent(accountId: string, event: any): Promise<void> {
  logDebug("events", `Received event: ${event.post_type}`);

  const ctx = channelRuntimes.get(accountId);
  if (!ctx) {
    logWarn("events", `No runtime context for account: ${accountId}`);
    return;
  }

  switch (event.post_type) {
    case "message_sent_type":
      await handleGroupMessage(accountId, event, ctx);
      break;

    case "message_private_sent_type":
      await handlePrivateMessage(accountId, event, ctx);
      break;

    case "notice":
      await handleNoticeEvent(accountId, event, ctx);
      break;

    default:
      logDebug("events", `Unhandled event type: ${event.post_type}`);
  }
}

async function handleGroupMessage(accountId: string, event: any, ctx: any): Promise<void> {
  const conn = connectionManager.getConnection(accountId);
  if (!conn) return;

  // Cache bot user ID
  if (event.self_id && !botUserIds.has(accountId)) {
    botUserIds.set(accountId, event.self_id);
    conn.setBotUserId(event.self_id);
  }

  const botUserId = conn.getBotUserId();
  const { content, isMention } = napCatToOpenClawMessage(event.message, botUserId);

  const message = {
    id: messageIdToString(event.message_id),
    channel: "openclaw-channel-qq",
    accountId,
    chatId: String(event.group_id),
    chatType: "group" as const,
    content,
    senderId: String(event.user_id),
    senderName: event.sender?.nickname || event.sender?.card,
    timestamp: event.time * 1000,
    isMention,
  };

  logDebug("events", `Group message: ${getMessageSummary(event.message)}`);
  ctx.dispatchMessage(message);
}

async function handlePrivateMessage(accountId: string, event: any, ctx: any): Promise<void> {
  const conn = connectionManager.getConnection(accountId);
  if (!conn) return;

  // Cache bot user ID
  if (event.self_id && !botUserIds.has(accountId)) {
    botUserIds.set(accountId, event.self_id);
    conn.setBotUserId(event.self_id);
  }

  const { content } = napCatToOpenClawMessage(event.message);

  const message = {
    id: messageIdToString(event.message_id),
    channel: "openclaw-channel-qq",
    accountId,
    chatId: String(event.user_id),
    chatType: "direct" as const,
    content,
    senderId: String(event.user_id),
    senderName: event.sender?.nickname,
    timestamp: event.time * 1000,
  };

  logDebug("events", `Private message: ${getMessageSummary(event.message)}`);
  ctx.dispatchMessage(message);
}

async function handleNoticeEvent(accountId: string, event: any, ctx: any): Promise<void> {
  if (event.notice_type === "poke") {
    const conn = connectionManager.getConnection(accountId);
    if (!conn) return;

    const botUserId = conn.getBotUserId();
    if (botUserId && event.target_id !== botUserId) return;

    const message = {
      id: generateMessageId(),
      channel: "openclaw-channel-qq",
      accountId,
      chatId: event.group_id ? String(event.group_id) : String(event.user_id),
      chatType: event.group_id ? ("group" as const) : ("direct" as const),
      content: [{ type: "text" as const, text: `${event.sender_id} 戳了戳你` }],
      senderId: String(event.user_id),
      timestamp: event.time * 1000,
    };

    ctx.dispatchMessage(message);
  }
}

// =============================================================================
// Initialization
// =============================================================================

export function initializePlugin(): void {
  connectionManager = new MultiConnectionManager();
}

// Auto-initialize on import
initializePlugin();
