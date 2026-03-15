/**
 * QQ Event Handler Module
 *
 * 统一事件处理入口，提供：
 * - 事件上下文构建 (buildEventContext)
 * - 统一授权检查 (checkEventAuthorization)
 * - 事件处理器工厂 (createQQEventHandler)
 */

import type { NapCatEvent, NapCatMessage, QQEventContext, QQEventType, DispatchMessageMedia, OpenClawMessage } from "../types";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { getContext, setContextStatus } from "./runtime.js";
import { resolveQQCommandAuthorization, getQQConfigByChatType } from "./auth.js";
import { napCatToOpenClawMessage } from "../adapters/message.js";
import { dispatchMessage } from "./dispatch.js";
import { Logger as log } from "../utils/index.js";
import type { QQConfig, QQEventHandlerParams } from "../types";

// =============================================================================
// Event Context Building
// =============================================================================

/**
 * NapCat 消息事件类型
 */
interface NapCatMessageEvent extends NapCatEvent {
  post_type: "message";
  message_type: "group" | "private";
  message: NapCatMessage[];
  raw_message: string;
  user_id: number;
  group_id?: number;
  message_id?: number;
  time: number;
  sender?: {
    nickname?: string;
    card?: string;
  };
}

/**
 * NapCat 戳一戳事件类型
 */
interface NapCatPokeEvent extends NapCatEvent {
  post_type: "notice";
  notice_type: "poke" | "notify";
  sub_type?: string;
  user_id: number;
  target_id: number;
  group_id?: number;
  time: number;
  raw_info?: Array<{ type: string; txt?: string }>;
}

/**
 * 从 NapCat 事件构建 QQEventContext
 *
 * @returns QQEventContext 或 null（如果事件应被忽略）
 */
export async function buildEventContext(
  event: NapCatEvent,
  params: QQEventHandlerParams
): Promise<QQEventContext | null> {
  const context = getContext();
  if (!context) {
    log.warn("event-handler", "No gateway context");
    return null;
  }

  // 处理消息事件
  if (event.post_type === "message") {
    return buildMessageEventContext(event as NapCatMessageEvent, params, context);
  }

  // 处理通知事件
  if (event.post_type === "notice") {
    const noticeEvent = event as NapCatPokeEvent;
    const isPokeEvent =
      noticeEvent.notice_type === "poke" ||
      (noticeEvent.notice_type === "notify" && noticeEvent.sub_type === "poke");

    if (isPokeEvent) {
      return buildPokeEventContext(noticeEvent, params, context);
    }
  }

  // 不支持的事件类型
  log.debug("event-handler", `Unhandled event type: ${event.post_type}`);
  return null;
}

/**
 * 构建消息事件上下文
 */
async function buildMessageEventContext(
  event: NapCatMessageEvent,
  params: QQEventHandlerParams,
  context: { account: QQConfig; cfg: OpenClawConfig; accountId: string }
): Promise<QQEventContext | null> {
  // 过滤空消息
  if (!event.raw_message || event.raw_message.trim() === "") {
    log.debug("event-handler", "Ignored empty message");
    return null;
  }

  const isGroup = event.message_type === "group";
  const senderId = event.user_id.toString();
  const chatId = isGroup ? event.group_id!.toString() : senderId;

  // 获取配置并进行授权检查
  const qqConfig = getQQConfigByChatType(isGroup, chatId, context.account);
  const fromLabel = isGroup ? `qq:group:${chatId}` : `qq:user:${senderId}`;
  // noinspection UnnecessaryLocalVariableJS
  const toLabel = fromLabel;

  const authorization = resolveQQCommandAuthorization({
    senderId,
    from: fromLabel,
    to: toLabel,
    cfg: context.cfg,
    qqConfig,
  });

  // 解析消息内容
  const content = await napCatToOpenClawMessage(event.message);
  const plainText = await contentToPlainText(content);
  const media = await contextToMedia(content);

  const eventType: QQEventType = isGroup ? "message:group" : "message:private";

  return {
    event,
    eventType,
    senderId,
    senderName: event.sender?.nickname || event.sender?.card,
    chatType: isGroup ? "group" : "direct",
    chatId,
    groupId: isGroup ? chatId : undefined,
    content: plainText,
    media,
    messageId: event.message_id?.toString(),
    timestamp: event.time * 1000,
    authorization: {
      isAuthorizedSender: authorization.isAuthorizedSender,
      denialReason: authorization.denialReason,
    },
  };
}

/**
 * 构建戳一戳事件上下文
 */
function buildPokeEventContext(
  event: NapCatPokeEvent,
  params: QQEventHandlerParams,
  context: { account: QQConfig; cfg: OpenClawConfig; accountId: string }
): QQEventContext {
  const isGroup = !!event.group_id;
  const senderId = event.user_id.toString();
  const chatId = isGroup ? event.group_id!.toString() : senderId;

  // 获取配置并进行授权检查
  const qqConfig = getQQConfigByChatType(isGroup, chatId, context.account);
  const fromLabel = isGroup ? `qq:group:${chatId}` : `qq:user:${senderId}`;
  // noinspection UnnecessaryLocalVariableJS
  const toLabel = fromLabel;

  const authorization = resolveQQCommandAuthorization({
    senderId,
    from: fromLabel,
    to: toLabel,
    cfg: context.cfg,
    qqConfig,
  });

  // 提取戳一戳动作文本
  const actionText = extractPokeActionText(event.raw_info);
  const pokeContent = `[动作]${actionText || "戳了戳"}`;

  return {
    event,
    eventType: "notice:poke",
    senderId,
    senderName: senderId,
    chatType: isGroup ? "group" : "direct",
    chatId,
    groupId: isGroup ? chatId : undefined,
    content: pokeContent,
    timestamp: event.time * 1000,
    targetId: event.target_id.toString(),
    authorization: {
      isAuthorizedSender: authorization.isAuthorizedSender,
      denialReason: authorization.denialReason,
    },
  };
}

/**
 * 提取戳一戳动作文本
 */
function extractPokeActionText(
  rawInfo?: Array<{ type: string; txt?: string }>
): string {
  if (!rawInfo) return "戳了戳";
  const actionItem = rawInfo.find((item) => item.type === "nor" && item.txt);
  return actionItem?.txt || "戳了戳";
}

// =============================================================================
// Authorization Check
// =============================================================================

/**
 * 检查事件是否被授权
 */
export function isEventAuthorized(ctx: QQEventContext): boolean {
  if (!ctx.authorization) {
    return false;
  }

  if (!ctx.authorization.isAuthorizedSender) {
    log.info(
      "event-handler",
      `Authorization denied for ${ctx.senderId}: ${ctx.authorization.denialReason}`
    );
    return false;
  }

  return true;
}

// =============================================================================
// Event Handler Factory
// =============================================================================

/**
 * 创建 QQ 事件处理器
 *
 * 这是统一的事件处理入口点，负责：
 * 1. 构建事件上下文
 * 2. 执行授权检查
 * 3. 更新状态
 * 4. 路由到具体处理器
 *
 * @example
 * ```typescript
 * const handler = createQQEventHandler({
 *   runtime,
 *   cfg: context.cfg,
 *   accountId: context.accountId,
 *   connection,
 * });
 *
 * connection.on("event", handler);
 * ```
 */
export function createQQEventHandler(
  params: QQEventHandlerParams
): (event: NapCatEvent) => Promise<void> {
  return async (event: NapCatEvent): Promise<void> => {
    log.debug("event-handler", `Received event: ${event.post_type}`);

    // 1. 构建事件上下文
    const ctx = await buildEventContext(event, params);
    if (!ctx) {
      return;
    }

    // 2. 授权检查
    if (!isEventAuthorized(ctx)) {
      return;
    }

    // 3. 更新状态
    setContextStatus({ lastInboundAt: Date.now() });

    // 4. 路由到具体处理器 - 调用 dispatchMessage
    await dispatchMessage(ctx);

    return;
  };
}

// =============================================================================
// Helper Functions (from dispatch.ts, will be used by dispatchMessage)
// =============================================================================

/**
 * 将 OpenClaw 消息内容转换为纯文本
 * (从 dispatch.ts 移植)
 */
async function contentToPlainText(
  content: OpenClawMessage[]
): Promise<string> {
  const results = await Promise.all(
    content.map(async (c) => {
      switch (c.type) {
        case "text":
          return c.text;
        case "at": {
          const target = c.isAll ? "@全体成员" : `@${c.userId || "unknown"}`;
          return `[提及]${target}`;
        }
        case "image":
          return `[图片]${c.url || ""}`;
        case "audio":
          return `[音频]${c.path || ""}`;
        case "video":
          return `[视频]${c.url || ""}`;
        case "file":
          // 文件处理需要 getFile，这里简化处理
          return `[文件]${c.fileId || ""}`;
        case "json":
          return `[JSON]\n\n\`\`\`json\n${c.data || ""}\n\`\`\``;
        case "reply": {
          const senderInfo =
            c.sender && c.senderId
              ? `${c.sender}(${c.senderId})`
              : "(未知用户)";
          const replyMsg = c.message ?? "(无法获取原消息)";
          const quotedContent = `${senderInfo}:\n${replyMsg}`.replace(
            /^/gm,
            "> "
          );
          return `[回复]\n\n${quotedContent}`;
        }
        default:
          return null;
      }
    })
  );
  return results.filter((v): v is string => v !== null).join("\n");
}

/**
 * 从 OpenClaw 消息内容提取媒体信息
 * (从 dispatch.ts 移植)
 */
async function contextToMedia(
  content: OpenClawMessage[]
): Promise<DispatchMessageMedia | undefined> {
  const hasMedia = content.some(
    (c) => c.type === "image" || c.type === "audio" || c.type === "file"
  );
  if (!hasMedia) {
    return;
  }

  const image = content.find((c) => c.type === "image");
  if (image) {
    return {
      type: "image/jpeg",
      path: image.url,
      url: image.url,
    };
  }

  const audio = content.find((c) => c.type === "audio");
  if (audio) {
    return {
      type: "audio/amr",
      path: audio.path,
      url: audio.url,
    };
  }

  const file = content.find((c) => c.type === "file");
  if (file) {
    return {
      type: "application/octet-stream",
      path: file.file,
      url: file.url,
    };
  }

  return;
}
