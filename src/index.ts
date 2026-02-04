/**
 * QQ NapCat Plugin for OpenClaw
 * Main plugin entry point
 */

import type { ChannelPlugin, ChannelOutboundContext } from "openclaw/plugin-sdk";
import type { AccountConfig, ConnectionStatus, OutboundDeliveryResult } from "./types/index.js";
import {
  messageIdToString,
  logDebug,
  logWarn,
} from "./utils/index.js";
import { MultiConnectionManager } from "./core/connection.js";
import { openClawToNapCatMessage } from "./adapters/message.js";
import { handleGroupMessage, handlePrivateMessage, handlePokeEvent } from "./core/dispatch.js";
import {
  listQQNapCatAccountIds,
  resolveQQNapCatAccount,
  applyQQNapCatAccountConfig,
} from "./core/config.js";
import { qqNapCatOnboardingAdapter } from "./onboarding.js";
import { createSecurityAdapter } from "./adapters/security.js";
import { createDirectoryAdapter } from "./adapters/directory.js";

// =============================================================================
// Plugin State
// =============================================================================

let connectionManager: MultiConnectionManager;

// Channel gateway contexts per account (for cfg, log, setStatus)
const gatewayContexts = new Map<string, any>();

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
    media: true,
    reactions: false,
    threads: false,
    nativeCommands: true,
    blockStreaming: false,
  },
  reload: { configPrefixes: ["channels.openclaw-channel-qq"] },

  // CLI onboarding wizard
  onboarding: qqNapCatOnboardingAdapter,

  // Security adapter
  security: createSecurityAdapter({
    getConnection: (accountId: string) => {
      return connectionManager?.getConnection(accountId);
    },
  }),

  // Directory adapter
  directory: createDirectoryAdapter({
    getConnection: (accountId: string) => {
      return connectionManager?.getConnection(accountId);
    },
  }),

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
    sendText: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
      const { to, text, accountId, cfg, replyToId } = ctx;
      if (!accountId) {
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error("accountId is required"),
          deliveredAt: Date.now(),
        };
      }
      const account = resolveQQNapCatAccount(cfg, accountId);
      if (!account) {
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error(`Account not found: ${accountId}`),
          deliveredAt: Date.now(),
        };
      }

      const conn = connectionManager?.getConnection(accountId);
      if (!conn || !conn.isConnected()) {
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error(`Not connected for account: ${accountId}`),
          deliveredAt: Date.now(),
        };
      }

      // Parse target (format: private:xxx or group:xxx)
      const parts = to.split(":");
      const type = parts[0];
      const id = parts[1];
      const chatType = type === "group" ? "group" : "direct";
      const chatId = id || to;

      try {
        const messageSegments = openClawToNapCatMessage([{ type: "text", text }], replyToId ?? undefined);

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

        // Update lastOutboundAt timestamp on successful send
        if (response.status === "ok") {
          const gatewayCtx = gatewayContexts.get(accountId);
          if (gatewayCtx) {
            gatewayCtx.setStatus({
              ...gatewayCtx.getStatus(),
              lastOutboundAt: Date.now(),
            });
          }
        }

        if (response.status === "ok" && response.data) {
          const data = response.data as { message_id: number };
          return {
            channel: "openclaw-channel-qq",
            messageId: messageIdToString(data.message_id),
            deliveredAt: Date.now(),
          };
        } else {
          return {
            channel: "openclaw-channel-qq",
            messageId: "",
            error: new Error(response.msg || "Send failed"),
            deliveredAt: Date.now(),
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error(errorMessage),
          deliveredAt: Date.now(),
        };
      }
    },
    sendMedia: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
      const { to, mediaUrl, accountId, cfg, replyToId } = ctx;
      if (!accountId) {
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error("accountId is required"),
          deliveredAt: Date.now(),
        };
      }
      if (!mediaUrl) {
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error("mediaUrl is required"),
          deliveredAt: Date.now(),
        };
      }
      const account = resolveQQNapCatAccount(cfg, accountId);
      if (!account) {
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error(`Account not found: ${accountId}`),
          deliveredAt: Date.now(),
        };
      }

      const conn = connectionManager?.getConnection(accountId);
      if (!conn || !conn.isConnected()) {
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error(`Not connected for account: ${accountId}`),
          deliveredAt: Date.now(),
        };
      }

      // Parse target (format: private:xxx or group:xxx)
      const parts = to.split(":");
      const type = parts[0];
      const id = parts[1];
      const chatType = type === "group" ? "group" : "direct";
      const chatId = id || to;

      try {
        // Build media segment - assume image type from mediaUrl
        const mediaSegment = { type: "image", data: { file: mediaUrl, url: mediaUrl } };

        // Build message segments with optional reply
        const messageSegments: Array<{ type: string; data: Record<string, unknown> }> = [];
        if (replyToId) {
          messageSegments.push({ type: "reply", data: { id: replyToId } });
        }
        messageSegments.push(mediaSegment);

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

        // Update lastOutboundAt timestamp on successful send
        if (response.status === "ok") {
          const gatewayCtx = gatewayContexts.get(accountId);
          if (gatewayCtx) {
            gatewayCtx.setStatus({
              ...gatewayCtx.getStatus(),
              lastOutboundAt: Date.now(),
            });
          }
        }

        if (response.status === "ok" && response.data) {
          const data = response.data as { message_id: number };
          return {
            channel: "openclaw-channel-qq",
            messageId: messageIdToString(data.message_id),
            deliveredAt: Date.now(),
          };
        } else {
          return {
            channel: "openclaw-channel-qq",
            messageId: "",
            error: new Error(response.msg || "Send media failed"),
            deliveredAt: Date.now(),
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          channel: "openclaw-channel-qq",
          messageId: "",
          error: new Error(errorMessage),
          deliveredAt: Date.now(),
        };
      }
    },
  },

  gateway: {
    startAccount: async (ctx: any) => {
      const { account, log } = ctx;

      log?.info(`[openclaw-channel-qq:${account.accountId}] Starting gateway`);

      // Update start time
      ctx.setStatus({
        ...ctx.getStatus(),
        lastStartAt: Date.now(),
      });

      // Store runtime context
      gatewayContexts.set(account.accountId, ctx);

      // Start connection
      const conn = connectionManager.addConnection(account.accountId, account);

      conn.on("event", (event) => handleNapCatEvent(account.accountId, event));
      conn.on("state-changed", (status: ConnectionStatus) => {
        log?.info(`[openclaw-channel-qq:${account.accountId}] State: ${status.state}`);
        if (status.state === "connected") {
          ctx.setStatus({
            ...ctx.getStatus(),
            running: true,
            connected: true,
            lastConnectedAt: Date.now(),
          });
        } else if (status.state === "disconnected" || status.state === "failed") {
          ctx.setStatus({
            ...ctx.getStatus(),
            running: false,
            connected: false,
            lastError: status.error,
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
      // Update running state
      ctx.setStatus({
        ...ctx.getStatus(),
        running: false,
        connected: false,
        lastStopAt: Date.now(),
      });
      gatewayContexts.delete(account.accountId);
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      reconnectAttempts: 0,
      lastInboundAt: null,
      lastOutboundAt: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    probeAccount: async ({ account, cfg: _cfg }: { account: AccountConfig; cfg: unknown }) => {
      const conn = connectionManager?.getConnection(account.accountId);
      if (!conn || !conn.isConnected()) {
        return {
          reachable: false,
          latencyMs: undefined,
          error: 'Not connected',
        };
      }

      try {
        const startTime = Date.now();
        // Use get_login_info as a lightweight probe
        await conn.sendRequest('get_login_info', {});
        const latencyMs = Date.now() - startTime;

        return {
          reachable: true,
          latencyMs,
          error: undefined,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          reachable: false,
          latencyMs: undefined,
          error: errorMessage,
        };
      }
    },
    buildAccountSnapshot: ({ account, runtime }: { account: AccountConfig; runtime?: { running?: boolean; connected?: boolean; lastConnectedAt?: number | null; reconnectAttempts?: number; lastInboundAt?: number | null; lastOutboundAt?: number | null; lastStartAt?: number | null; lastStopAt?: number | null; lastError?: string | null } }) => {
      const conn = connectionManager?.getConnection(account.accountId);
      const stats = conn?.getStats();

      return {
        accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID,
        name: account?.name ?? account?.wsUrl,
        enabled: account?.enabled ?? false,
        configured: Boolean(account?.wsUrl),
        running: runtime?.running ?? false,
        connected: runtime?.connected ?? false,
        lastConnectedAt: runtime?.lastConnectedAt ?? null,
        reconnectAttempts: stats?.totalReconnectAttempts ?? runtime?.reconnectAttempts ?? 0,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
      };
    },
  },
};

// =============================================================================
// Event Handling
// =============================================================================

async function handleNapCatEvent(accountId: string, event: {
  post_type: string;
  message_type?: string;
  notice_type?: string;
  time: number;
  self_id: number;
  message_id?: number;
  group_id?: number;
  user_id: number;
  message?: Array<{ type: string; data: Record<string, unknown> }>;
  sender?: {
    nickname?: string;
    card?: string;
  };
  target_id?: number;
}): Promise<void> {
  logDebug("events", `Received event: ${event.post_type}, message_type: ${event.message_type}`);

  const ctx = gatewayContexts.get(accountId);
  if (!ctx) {
    logWarn("events", `No gateway context for account: ${accountId}`);
    return;
  }

  const { account, cfg, log } = ctx;

  // NapCat/OneBot 11 uses post_type: "message" with message_type: "private" or "group"
  switch (event.post_type) {
    case "message":
      // Update lastInboundAt timestamp
      ctx.setStatus({
        ...ctx.getStatus(),
        lastInboundAt: Date.now(),
      });

      if (event.message_type === "group" && event.group_id) {
        await handleGroupMessage(accountId, {
          time: event.time,
          self_id: event.self_id,
          message_id: event.message_id ?? 0,
          group_id: event.group_id,
          user_id: event.user_id,
          message: event.message ?? [],
          sender: event.sender,
        }, { account, cfg, log }, connectionManager);
      } else if (event.message_type === "private") {
        await handlePrivateMessage(accountId, {
          time: event.time,
          self_id: event.self_id,
          message_id: event.message_id ?? 0,
          user_id: event.user_id,
          message: event.message ?? [],
          sender: event.sender,
        }, { account, cfg, log }, connectionManager);
      }
      break;

    case "notice":
      // Notice events (like poke) are handled but don't trigger AI responses
      if (event.notice_type === "poke" && event.target_id) {
        await handlePokeEvent(accountId, {
          user_id: event.user_id,
          target_id: event.target_id,
          group_id: event.group_id,
        }, { account, cfg, log }, connectionManager);
      }
      break;

    default:
      logDebug("events", `Unhandled event type: ${event.post_type}`);
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
