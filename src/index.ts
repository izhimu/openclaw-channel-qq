/**
 * QQ NapCat Plugin for OpenClaw
 * Main plugin entry point
 */

import type { ChannelPlugin } from "openclaw/plugin-sdk";
import type { AccountConfig, ConnectionStatus } from "./types.js";
import {
  messageIdToString,
  logDebug,
  logWarn,
} from "./utils.js";
import { MultiConnectionManager } from "./connection.js";
import {
  napCatToOpenClawMessage,
  openClawToNapCatMessage,
} from "./adapters.js";
import {
  listQQNapCatAccountIds,
  resolveQQNapCatAccount,
  applyQQNapCatAccountConfig,
} from "./config.js";
import { qqNapCatOnboardingAdapter } from "./onboarding.js";

// =============================================================================
// Plugin State
// =============================================================================

let connectionManager: MultiConnectionManager;

// Bot user ID cache for routing
const botUserIds = new Map<string, number>();

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
    media: false,
    reactions: false,
    threads: false,
  },
  reload: { configPrefixes: ["channels.openclaw-channel-qq"] },

  // CLI onboarding wizard
  onboarding: qqNapCatOnboardingAdapter,

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
      gatewayContexts.delete(account.accountId);
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
      if (event.message_type === "group") {
        await handleGroupMessage(accountId, event, { account, cfg, log });
      } else if (event.message_type === "private") {
        await handlePrivateMessage(accountId, event, { account, cfg, log });
      }
      break;

    case "notice":
      // Notice events (like poke) are handled but don't trigger AI responses
      if (event.notice_type === "poke") {
        await handlePokeEvent(accountId, event, { account, cfg, log });
      }
      break;

    default:
      logDebug("events", `Unhandled event type: ${event.post_type}`);
  }
}

async function handleGroupMessage(
  accountId: string,
  event: any,
  ctx: { account: any; cfg: any; log?: any }
): Promise<void> {
  const { account, cfg, log } = ctx;
  const conn = connectionManager.getConnection(accountId);
  if (!conn) return;

  // Cache bot user ID
  if (event.self_id && !botUserIds.has(accountId)) {
    botUserIds.set(accountId, event.self_id);
    conn.setBotUserId(event.self_id);
  }

  const botUserId = conn.getBotUserId();
  const { content, isMention } = napCatToOpenClawMessage(event.message, botUserId);

  // Convert content array to plain text for the message body
  const plainText = content.map((c: any) => {
    if (c.type === "text") return c.text;
    if (c.type === "at") return c.isAll ? "@全体成员" : `@${c.userId}`;
    if (c.type === "image") return "[图片]";
    if (c.type === "reply") return "[回复]";
    if (c.type === "face") return c.text || "[表情]";
    return "";
  }).join("");

  log?.info(`[openclaw-channel-qq:${accountId}] Group message from ${event.sender?.nickname || event.sender?.card || event.user_id}: ${plainText}`);

  await dispatchMessage({
    accountId,
    cfg,
    log,
    chatType: "group",
    chatId: String(event.group_id),
    senderId: String(event.user_id),
    senderName: event.sender?.nickname || event.sender?.card,
    messageId: String(event.message_id),
    content: plainText,
    timestamp: event.time * 1000,
    conn,
  });
}

async function handlePrivateMessage(
  accountId: string,
  event: any,
  ctx: { account: any; cfg: any; log?: any }
): Promise<void> {
  const { account, cfg, log } = ctx;
  const conn = connectionManager.getConnection(accountId);
  if (!conn) return;

  // Cache bot user ID
  if (event.self_id && !botUserIds.has(accountId)) {
    botUserIds.set(accountId, event.self_id);
    conn.setBotUserId(event.self_id);
  }

  const { content } = napCatToOpenClawMessage(event.message);

  // Convert content array to plain text for the message body
  const plainText = content.map((c: any) => {
    if (c.type === "text") return c.text;
    if (c.type === "at") return c.isAll ? "@全体成员" : `@${c.userId}`;
    if (c.type === "image") return "[图片]";
    if (c.type === "reply") return "[回复]";
    if (c.type === "face") return c.text || "[表情]";
    return "";
  }).join("");

  log?.info(`[openclaw-channel-qq:${accountId}] Private message from ${event.sender?.nickname || event.user_id}: ${plainText}`);

  await dispatchMessage({
    accountId,
    cfg,
    log,
    chatType: "direct",
    chatId: String(event.user_id),
    senderId: String(event.user_id),
    senderName: event.sender?.nickname,
    messageId: String(event.message_id),
    content: plainText,
    timestamp: event.time * 1000,
    conn,
  });
}

async function handlePokeEvent(
  accountId: string,
  event: any,
  ctx: { account: any; cfg: any; log?: any }
): Promise<void> {
  const conn = connectionManager.getConnection(accountId);
  if (!conn) return;

  const botUserId = conn.getBotUserId();
  if (botUserId && event.target_id !== botUserId) return;

  ctx.log?.info(`[openclaw-channel-qq:${accountId}] Poke from ${event.user_id}`);
  // Poke events don't trigger AI responses, just log them
}

async function dispatchMessage(params: {
  accountId: string;
  cfg: any;
  log?: any;
  chatType: "direct" | "group";
  chatId: string;
  senderId: string;
  senderName?: string;
  messageId: string;
  content: string;
  timestamp: number;
  conn: any;
}): Promise<void> {
  const { accountId, cfg, log, chatType, chatId, senderId, senderName, messageId, content, timestamp, conn } = params;

  // Import here to avoid circular dependency
  const { getNapCatRuntime } = await import("./runtime.js");
  const pluginRuntime = getNapCatRuntime();

  const isGroup = chatType === "group";
  const peerId = isGroup ? `group:${chatId}` : senderId;

  // Resolve agent route
  const route = pluginRuntime.channel.routing.resolveAgentRoute({
    cfg,
    channel: "openclaw-channel-qq",
    accountId,
    peer: {
      kind: isGroup ? "group" : "dm",
      id: peerId,
    },
  });

  const envelopeOptions = pluginRuntime.channel.reply.resolveEnvelopeFormatOptions(cfg);

  // Format inbound message
  const body = pluginRuntime.channel.reply.formatInboundEnvelope({
    channel: "QQ",
    from: senderName || senderId,
    timestamp,
    body: content,
    chatType: isGroup ? "group" : "direct",
    sender: {
      id: senderId,
      name: senderName,
    },
    envelope: envelopeOptions,
  });

  const fromAddress = isGroup ? `openclaw-channel-qq:group:${chatId}` : `openclaw-channel-qq:private:${senderId}`;
  const toAddress = fromAddress;

  const ctxPayload = pluginRuntime.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: content,
    CommandBody: content,
    From: fromAddress,
    To: toAddress,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    SenderId: senderId,
    SenderName: senderName,
    Provider: "openclaw-channel-qq",
    Surface: "openclaw-channel-qq",
    MessageSid: messageId,
    Timestamp: timestamp,
    OriginatingChannel: "openclaw-channel-qq",
    OriginatingTo: toAddress,
  });

  log?.info(`[openclaw-channel-qq:${accountId}] Dispatching to agent ${route.agentId}, session: ${route.sessionKey}`);

  // Send function for delivering replies
  const sendReply = async (text: string) => {
    const messageSegments = [{ type: "text", data: { text } }];

    try {
      if (isGroup) {
        await conn.sendRequest("send_group_msg", {
          group_id: Number(chatId),
          message: messageSegments,
        });
      } else {
        await conn.sendRequest("send_private_msg", {
          user_id: Number(chatId),
          message: messageSegments,
        });
      }
      log?.info(`[openclaw-channel-qq:${accountId}] Sent reply: ${text.slice(0, 100)}`);
    } catch (error) {
      log?.error(`[openclaw-channel-qq:${accountId}] Send failed: ${error}`);
    }
  };

  // Get messages config for response prefix
  const messagesConfig = pluginRuntime.channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId);
  log?.info(`[openclaw-channel-qq:${accountId}] Messages config: ${JSON.stringify(messagesConfig)}`);

  // Track if we got any response
  let hasResponse = false;

  // Dispatch the message for AI processing
  try {
    log?.info(`[openclaw-channel-qq:${accountId}] Calling dispatchReplyWithBufferedBlockDispatcher...`);

    const dispatchPromise = pluginRuntime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        responsePrefix: messagesConfig.responsePrefix,
        deliver: async (payload: { text?: string }, info: { kind: string }) => {
          hasResponse = true;
          log?.info(`[openclaw-channel-qq:${accountId}] deliver(${info.kind}): ${payload.text?.slice(0, 100) || "(empty)"}`);
          if (payload.text) {
            await sendReply(payload.text);
          }
        },
        onError: async (err: unknown) => {
          hasResponse = true;
          log?.error(`[openclaw-channel-qq:${accountId}] Dispatch error: ${err}`);
          await sendReply(`[错误] ${String(err).slice(0, 200)}`);
        },
      },
      replyOptions: {},
    });

    // Wait for dispatch to complete
    await dispatchPromise;

    log?.info(`[openclaw-channel-qq:${accountId}] Dispatch completed, hasResponse: ${hasResponse}`);
  } catch (error) {
    log?.error(`[openclaw-channel-qq:${accountId}] Message processing failed: ${error}`);
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
