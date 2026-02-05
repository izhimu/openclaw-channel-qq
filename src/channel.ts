/**
 * QQ NapCat Plugin for OpenClaw
 * Main plugin entry point
 */

import { ChannelPlugin, ChannelOutboundContext, ChannelGatewayContext } from "openclaw/plugin-sdk";
import { buildChannelConfigSchema, DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { QQConfig, ConnectionStatus, OutboundDeliveryResult } from "./types/index.js";
import {
  messageIdToString,
  Logger as log
} from "./utils/index.js";
import { ConnectionManager } from "./core/connection.js";
import { openClawToNapCatMessage } from "./adapters/message.js";
import { handleGroupMessage, handlePrivateMessage, handlePokeEvent } from "./core/dispatch.js";
import {
  listQQAccountIds,
  resolveQQAccount,
  QQConfigSchema
} from "./core/config.js";
import { qqOnboardingAdapter } from "./onboarding.js";

// =============================================================================
// Plugin State
// =============================================================================

let connection: ConnectionManager | null = null;
let context: ChannelGatewayContext<QQConfig> | null = null;

// =============================================================================
// Plugin Definition
// =============================================================================

export const qqPlugin: ChannelPlugin<QQConfig> = {
  id: "openclaw-channel-qq",
  meta: {
    id: "openclaw-channel-qq",
    label: "QQ",
    selectionLabel: "QQ",
    docsPath: "/docs/channels/qq",
    blurb: "通过 NapCat WebSocket 连接 QQ 机器人",
    order: 50,
    quickstartAllowFrom: true,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: true,
    reply: true,
    media: true,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.qq"] },
  onboarding: qqOnboardingAdapter,
  config: {
    listAccountIds: (cfg) => listQQAccountIds(cfg),
    resolveAccount: (cfg) => resolveQQAccount({ cfg }),
    isEnabled: (account) => Boolean(account?.enabled),
    isConfigured: (account) => Boolean(account?.wsUrl),
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
    sendText: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
      const { to, text, accountId, cfg, replyToId } = ctx;
      if (!accountId) {
        return {
          channel: "qq",
          messageId: "",
          error: new Error("accountId is required"),
          deliveredAt: Date.now(),
        };
      }
      const account = resolveQQAccount({ cfg });
      if (!account) {
        return {
          channel: "qq",
          messageId: "",
          error: new Error(`Account not found: ${accountId}`),
          deliveredAt: Date.now(),
        };
      }

      if (!connection || !connection.isConnected()) {
        return {
          channel: "qq",
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

        const response = await connection.sendRequest("send_msg", {
          message_type: chatType === "direct" ? "private" : "group",
          user_id: chatType === "direct" ? Number(chatId) : undefined,
          group_id: chatType === "group" ? Number(chatId) : undefined,
          message: messageSegments,
        });

        // Update lastOutboundAt timestamp on successful send
        if (response.status === "ok") {
          context?.setStatus({
            ...context.getStatus(),
            lastOutboundAt: Date.now(),
          });
        }

        if (response.status === "ok" && response.data) {
          const data = response.data as { message_id: number };
          return {
            channel: "qq",
            messageId: messageIdToString(data.message_id),
            deliveredAt: Date.now(),
          };
        } else {
          return {
            channel: "qq",
            messageId: "",
            error: new Error(response.msg || "Send failed"),
            deliveredAt: Date.now(),
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          channel: "qq",
          messageId: "",
          error: new Error(errorMessage),
          deliveredAt: Date.now(),
        };
      }
    },
    sendMedia: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
      const { to, mediaUrl, accountId, cfg, replyToId } = ctx;

      log.debug("outbound", `sendMedia called - accountId: ${accountId}, to: ${to}, mediaUrl: ${mediaUrl ?? "null"}, replyToId: ${replyToId ?? "none"}`);

      if (!accountId) {
        log.warn("outbound", "sendMedia failed: accountId is required");
        return {
          channel: "qq",
          messageId: "",
          error: new Error("accountId is required"),
          deliveredAt: Date.now(),
        };
      }

      // Validate mediaUrl - check for null, undefined, empty string, or invalid URL
      if (mediaUrl === null || mediaUrl === undefined || mediaUrl === "") {
        log.warn("outbound", `sendMedia failed: mediaUrl is invalid (value: ${String(mediaUrl)})`);
        return {
          channel: "qq",
          messageId: "",
          error: new Error(`mediaUrl is required but received: ${mediaUrl === null ? "null" : mediaUrl === undefined ? "undefined" : "empty string"}`),
          deliveredAt: Date.now(),
        };
      }

      // Check if mediaUrl looks like a valid URL or file path
      const trimmedUrl = String(mediaUrl).trim();
      if (trimmedUrl === "" || trimmedUrl.length < 3) {
        log.warn("outbound", `sendMedia failed: mediaUrl is too short or empty after trim`);
        return {
          channel: "qq",
          messageId: "",
          error: new Error(`mediaUrl appears to be invalid: "${trimmedUrl}"`),
          deliveredAt: Date.now(),
        };
      }

      const account = resolveQQAccount({ cfg });
      if (!account) {
        log.warn("outbound", `sendMedia failed: Account not found: ${accountId}`);
        return {
          channel: "qq",
          messageId: "",
          error: new Error(`Account not found: ${accountId}`),
          deliveredAt: Date.now(),
        };
      }

      if (!connection || !connection.isConnected()) {
        log.warn("outbound", `sendMedia failed: Not connected for account: ${accountId}`);
        return {
          channel: "qq",
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

      log.debug("outbound", `Sending media to ${chatType}:${chatId}, url: ${trimmedUrl.substring(0, 100)}${trimmedUrl.length > 100 ? "..." : ""}`);

      try {
        // Build media segment - NapCat requires 'file' field
        // file can be: URL, file path, or base64
        const mediaSegment = {
          type: "image",
          data: {
            file: trimmedUrl,
            url: trimmedUrl,
            summary: "[图片]",
          },
        };

        // Build message segments with optional reply
        const messageSegments: Array<{ type: string; data: Record<string, unknown> }> = [];
        if (replyToId) {
          messageSegments.push({ type: "reply", data: { id: replyToId } });
        }
        messageSegments.push(mediaSegment);

        log.debug("outbound", `Message segments: ${JSON.stringify(messageSegments)}`);

        const response = await connection.sendRequest("send_msg", {
          message_type: chatType === "direct" ? "private" : "group",
          user_id: chatType === "direct" ? Number(chatId) : undefined,
          group_id: chatType === "group" ? Number(chatId) : undefined,
          message: messageSegments,
        });

        log.debug("outbound", `NapCat response - status: ${response.status}, retcode: ${response.retcode}, msg: ${response.msg ?? "none"}, data: ${JSON.stringify(response.data)}`);

        // Update lastOutboundAt timestamp on successful send
        if (response.status === "ok") {
          context?.setStatus({
            ...context.getStatus(),
            lastOutboundAt: Date.now(),
          });
        }

        if (response.status === "ok" && response.data) {
          const data = response.data as { message_id: number };
          log.debug("outbound", `Media sent successfully, message_id: ${data.message_id}`);
          return {
            channel: "qq",
            messageId: messageIdToString(data.message_id),
            deliveredAt: Date.now(),
          };
        } else {
          const errorMsg = response.msg || "Send media failed";
          log.warn("outbound", `sendMedia failed - status: ${response.status}, retcode: ${response.retcode}, msg: ${errorMsg}`);
          return {
            channel: "qq",
            messageId: "",
            error: new Error(`NapCat error [${response.retcode ?? "unknown"}]: ${errorMsg}`),
            deliveredAt: Date.now(),
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error("outbound", `sendMedia exception: ${errorMessage}`);
        return {
          channel: "qq",
          messageId: "",
          error: new Error(`sendMedia error: ${errorMessage}`),
          deliveredAt: Date.now(),
        };
      }
    },
  },
  status: {
    buildAccountSnapshot: ({ account, runtime }) => {
      return {
        accountId: DEFAULT_ACCOUNT_ID,
        name: "qq",
        enabled: account.enabled,
        configured: Boolean(account.wsUrl),
        ...runtime,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const { account } = context = ctx

      log.info('gateway', `Starting gateway`);

      // Update start time
      ctx.setStatus({
        ...ctx.getStatus(),
        running: true,
        lastStartAt: Date.now(),
      });

      // Create new connection manager
      connection = new ConnectionManager(account);

      connection.on("event", (event) => handleNapCatEvent(event));
      connection.on("state-changed", (status: ConnectionStatus) => {
        log.info('gateway', `State: ${status.state}`);
        if (status.state === "connected") {
          context?.setStatus({
            ...context.getStatus(),
            connected: true,
            lastConnectedAt: Date.now(),
          });
        } else if (status.state === "disconnected" || status.state === "failed") {
          context?.setStatus({
            ...context.getStatus(),
            connected: false,
            lastError: status.error,
          });
        }
      });

      await connection.start();

      log.info('gateway', `Started gateway`);
    },
    stopAccount: async (_ctx) => {
      if (connection) {
        await connection.stop();
      }
      // Update running state
      context?.setStatus({
        ...context.getStatus(),
        running: false,
        connected: false,
        lastStopAt: Date.now(),
      });
      context = null
    },
  },
};

// =============================================================================
// Event Handling
// =============================================================================

async function handleNapCatEvent(event: any): Promise<void> {
  log.debug("events", `Received event: ${event.post_type}`);

  if (!context) {
    log.warn("events", `No gateway context`);
    return;
  }

  if (!connection) {
    log.warn("events", `No connection available`);
    return;
  }

  const { account, cfg } = context;

  // NapCat/OneBot 11 uses post_type: "message" with message_type: "private" or "group"
  switch (event.post_type) {
    case "message":
      context.setStatus({
        ...context.getStatus(),
        lastInboundAt: Date.now(),
      });
      if (event.message_type === "group" && event.group_id) {
        await handleGroupMessage({
          time: event.time,
          self_id: event.self_id,
          message_id: event.message_id ?? 0,
          group_id: event.group_id,
          user_id: event.user_id,
          message: event.message ?? [],
          raw_message: event.raw_message ?? '',
          sender: event.sender,
        }, { account, cfg }, connection);
      } else if (event.message_type === "private") {
        await handlePrivateMessage({
          time: event.time,
          self_id: event.self_id,
          message_id: event.message_id ?? 0,
          user_id: event.user_id,
          message: event.message ?? [],
          raw_message: event.raw_message ?? '',
          sender: event.sender,
        }, { account, cfg }, connection);
      }
      break;

    case "notice":
      if (event.target_id) {
        const isPokeEvent =
          event.notice_type === "poke" ||
          (event.notice_type === "notify" && event.sub_type === "poke");

        if (isPokeEvent) {
          await handlePokeEvent({
            user_id: event.user_id,
            target_id: event.target_id,
            group_id: event.group_id,
            raw_info: event.raw_info,
          }, { account, cfg }, connection);
        }
      }
      break;

    default:
      log.debug("events", `Unhandled event type: ${event.post_type}`);
  }
}
