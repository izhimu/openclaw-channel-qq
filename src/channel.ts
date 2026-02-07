/**
 * QQ NapCat Plugin for OpenClaw
 * Main plugin entry point
 */

import type { ChannelPlugin, ChannelOutboundContext } from "openclaw/plugin-sdk";
import { buildChannelConfigSchema, DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { QQConfig, ConnectionStatus, OutboundDeliveryResult } from "./types/index.js";
import {
  messageIdToString,
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
import { eventListener, sendMsg } from "./core/request.js"
import { qqOnboardingAdapter } from "./onboarding.js";

export const qqPlugin: ChannelPlugin<QQConfig> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "QQ",
    selectionLabel: "QQ",
    docsPath: "/channels/qq",
    blurb: "通过 NapCat WebSocket 连接 QQ 机器人",
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
          channel: CHANNEL_ID,
          messageId: "",
          error: new Error("accountId is required"),
          deliveredAt: Date.now(),
        };
      }
      const account = resolveQQAccount({ cfg });
      if (!account) {
        return {
          channel: CHANNEL_ID,
          messageId: "",
          error: new Error(`Account not found: ${accountId}`),
          deliveredAt: Date.now(),
        };
      }

      const connection = getConnection()

      if (!connection?.isConnected()) {
        return {
          channel: CHANNEL_ID,
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

        const response = await sendMsg({
          message_type: chatType === "direct" ? "private" : "group",
          user_id: chatType === "direct" ? chatId : undefined,
          group_id: chatType === "group" ? chatId : undefined,
          message: messageSegments,
        })

        // Update lastOutboundAt timestamp on successful send
        if (response.status === "ok") {
          setContextStatus({
            lastOutboundAt: Date.now(),
          })
        }

        if (response.status === "ok" && response.data) {
          const data = response.data as { message_id: number };
          return {
            channel: CHANNEL_ID,
            messageId: messageIdToString(data.message_id),
            deliveredAt: Date.now(),
          };
        } else {
          return {
            channel: CHANNEL_ID,
            messageId: "",
            error: new Error(response.msg || "Send failed"),
            deliveredAt: Date.now(),
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          channel: CHANNEL_ID,
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
          channel: CHANNEL_ID,
          messageId: "",
          error: new Error("accountId is required"),
          deliveredAt: Date.now(),
        };
      }

      // Validate mediaUrl - check for null, undefined, empty string, or invalid URL
      if (mediaUrl === null || mediaUrl === undefined || mediaUrl === "") {
        log.warn("outbound", `sendMedia failed: mediaUrl is invalid (value: ${String(mediaUrl)})`);
        return {
          channel: CHANNEL_ID,
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
          channel: CHANNEL_ID,
          messageId: "",
          error: new Error(`mediaUrl appears to be invalid: "${trimmedUrl}"`),
          deliveredAt: Date.now(),
        };
      }

      const account = resolveQQAccount({ cfg });
      if (!account) {
        log.warn("outbound", `sendMedia failed: Account not found: ${accountId}`);
        return {
          channel: CHANNEL_ID,
          messageId: "",
          error: new Error(`Account not found: ${accountId}`),
          deliveredAt: Date.now(),
        };
      }

      const connection = getConnection()

      if (!connection?.isConnected()) {
        log.warn("outbound", `sendMedia failed: Not connected for account: ${accountId}`);
        return {
          channel: CHANNEL_ID,
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

        const response = await sendMsg({
          message_type: chatType === "direct" ? "private" : "group",
          user_id: chatType === "direct" ? chatId : undefined,
          group_id: chatType === "group" ? chatId : undefined,
          message: messageSegments,
        });

        log.debug("outbound", `NapCat response - status: ${response.status}, retcode: ${response.retcode}, msg: ${response.msg ?? "none"}, data: ${JSON.stringify(response.data)}`);

        // Update lastOutboundAt timestamp on successful send
        if (response.status === "ok") {
          setContextStatus({
            lastOutboundAt: Date.now(),
          });
        }

        if (response.status === "ok" && response.data) {
          const data = response.data as { message_id: number };
          log.debug("outbound", `Media sent successfully, message_id: ${data.message_id}`);
          return {
            channel: CHANNEL_ID,
            messageId: messageIdToString(data.message_id),
            deliveredAt: Date.now(),
          };
        } else {
          const errorMsg = response.msg || "Send media failed";
          log.warn("outbound", `sendMedia failed - status: ${response.status}, retcode: ${response.retcode}, msg: ${errorMsg}`);
          return {
            channel: CHANNEL_ID,
            messageId: "",
            error: new Error(`NapCat error [${response.retcode ?? "unknown"}]: ${errorMsg}`),
            deliveredAt: Date.now(),
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error("outbound", `sendMedia exception: ${errorMessage}`);
        return {
          channel: CHANNEL_ID,
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
        name: CHANNEL_ID,
        enabled: account.enabled,
        configured: Boolean(account.wsUrl),
        ...runtime,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      setContext(ctx)
      const { account } = ctx

      log.info('gateway', `Starting gateway`);

      // Update start time
      ctx.setStatus({
        ...ctx.getStatus(),
        running: true,
        lastStartAt: Date.now(),
      });

      // Create new connection manager
      const connection = new ConnectionManager(account);

      connection.on("event", (event) => eventListener(event));
      connection.on("state-changed", (status: ConnectionStatus) => {
        log.info('gateway', `State: ${status.state}`);
        if (status.state === "connected") {
          setContextStatus({
            connected: true,
            lastConnectedAt: Date.now(),
          });
        } else if (status.state === "disconnected" || status.state === "failed") {
          setContextStatus({
            connected: false,
            lastError: status.error,
          });
        }
      });

      await connection.start();

      setConnection(connection);

      log.info('gateway', `Started gateway`);
    },
    stopAccount: async (_ctx) => {
      const connection = getConnection();

      if (connection) {
        await connection.stop();
        clearConnection()
      }

      setContextStatus({
        running: false,
        connected: false,
        lastStopAt: Date.now(),
      });
      clearContext()
    },
  },
};
