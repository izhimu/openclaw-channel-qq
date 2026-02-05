/**
 * Message Dispatch Module
 * Handles routing and dispatching incoming messages to the AI
 */

import type { QQConfig, OpenClawMessageContent } from '../types/index.js';
import type { ConnectionManager } from './connection.js';
import { napCatToOpenClawMessageAsync } from '../adapters/message.js';
import { Logger as log, sendTypingIndicator, sendStoppedTyping } from '../utils/index.js';
import type { OpenClawConfig, ReplyPayload } from "openclaw/plugin-sdk";

/**
 * Format text for multi-line quote block by prefixing each line with ">"
 */
function formatQuoteBlock(text: string): string {
  if (!text) return '';
  return text.split('\n').map(line => `> ${line}`).join('\n');
}

/**
 * Convert OpenClaw message content array to plain text
 * For images, includes the URL so AI models can access them
 * For replies, includes quoted message content if available
 */
async function contentToPlainText(
  content: OpenClawMessageContent[],
  rawMessage: string,
  connection?: ConnectionManager
): Promise<string> {
  // Check if this message contains a reply segment
  const hasReply = content.some(c => c.type === 'reply');

  let quotedMessageText: string | null = null;
  if (hasReply && connection) {
    // Import parseReplyMessage to fetch quoted message
    const { parseReplyMessage } = await import('../adapters/message.js');
    const result = await parseReplyMessage(rawMessage, connection);
    if (result.isReply && result.data) {
      const quotedText = result.data.quotedSenderNickname + ': ' + result.data.quotedMessage;
      quotedMessageText = `[回复]\n\n${formatQuoteBlock(quotedText)}\n\n${result.data.replyText}`;
    }
  }

  // If we successfully fetched the quoted message, return it directly
  if (quotedMessageText) {
    return quotedMessageText;
  }

  // Otherwise, fall back to simple text conversion (but skip reply segments)
  return content
    .filter(c => c.type !== 'reply')
    .map((c) => {
      switch (c.type) {
        case 'text':
          return c.text;
        case 'at':
          return c.isAll ? '@全体成员' : `@${c.userId}`;
        case 'image': {
          // Include image URL so AI models can access the image
          // Use summary if available (e.g., "[动画表情]" for animated stickers)
          const label = c.summary || '[图片]';
          return c.url ? `${label}(${c.url})` : label;
        }
        case 'audio': {
          // Audio/voice messages - include URL if available
          const label = '[语音]';
          return c.url ? `${label}(${c.url})` : label;
        }
        case 'json': {
          // JSON messages - format as markdown code block
          const header = c.prompt || '[JSON]';
          return `${header}\n\`\`\`json\n${c.data}\n\`\`\``;
        }
        default:
          return '';
      }
    }).join('');
}

/**
 * Message dispatch parameters
 */
export interface DispatchMessageParams {
  cfg: OpenClawConfig;
  chatType: 'direct' | 'group';
  chatId: string;
  senderId: string;
  senderName?: string;
  messageId: string;
  content: string;
  timestamp: number;
  conn: ConnectionManager;
}

/**
 * Dispatch an incoming message to the AI for processing
 */
export async function dispatchMessage(params: DispatchMessageParams): Promise<void> {
  const { cfg, chatType, chatId, senderId, senderName, messageId, content, timestamp, conn } = params;

  // Import here to avoid circular dependency
  const { getQQRuntime } = await import('./runtime.js');
  const pluginRuntime = getQQRuntime();

  if (!pluginRuntime) {
    log.warn('dispatch', `Plugin runtime not available`);
    return;
  }

  const isGroup = chatType === 'group';
  const peerId = isGroup ? `group:${chatId}` : senderId;

  // Send typing indicator for private messages only (API requires user_id)
  let typingIndicatorSent = false;
  if (!isGroup) {
    await sendTypingIndicator(conn, senderId);
    typingIndicatorSent = true;
  }

  const route = pluginRuntime.channel.routing.resolveAgentRoute({
    cfg,
    channel: 'qq',
    peer: {
      kind: isGroup ? 'group' : 'dm',
      id: peerId,
    },
  });
  const envelopeOptions = pluginRuntime.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const body = pluginRuntime.channel.reply.formatInboundEnvelope({
    channel: 'qq',
    from: senderName || senderId,
    body: content,
    timestamp,
    chatType: isGroup ? 'group' : 'direct',
    sender: {
      id: senderId,
      name: senderName,
    },
    envelope: envelopeOptions,
  });
  const fromAddress = isGroup ? `qq:group:${chatId}` : `qq:private:${senderId}`;
  const toAddress = fromAddress;
  const ctxPayload = pluginRuntime.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: content,
    CommandBody: content,
    From: fromAddress,
    To: toAddress,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? 'group' : 'direct',
    SenderId: senderId,
    SenderName: senderName,
    Provider: 'qq',
    Surface: 'qq',
    MessageSid: messageId,
    Timestamp: timestamp,
    OriginatingChannel: 'qq',
    OriginatingTo: toAddress,
  });

  log.info('dispatch', `Dispatching to agent ${route.agentId}, session: ${route.sessionKey}`);

  // Send function for delivering replies
  const sendReply = async (text: string): Promise<void> => {
    const messageSegments = [{ type: 'text', data: { text } }];

    try {
      await conn.sendRequest('send_msg', {
        message_type: isGroup ? 'group' : 'private',
        group_id: isGroup ? Number(chatId) : undefined,
        user_id: !isGroup ? Number(chatId) : undefined,
        message: messageSegments,
      });
      log.info('dispatch', `Sent reply: ${text.slice(0, 100)}`);
    } catch (error) {
      log.error('dispatch', `Send failed: ${error}`);
    }
  };

  // Get messages config for response prefix
  const messagesConfig = pluginRuntime.channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId);
  log.info('dispatch', `Messages config: ${JSON.stringify(messagesConfig)}`);

  // Track if we got any response
  let hasResponse = false;

  // Dispatch the message for AI processing
  try {
    log.info('dispatch', `Calling dispatchReplyWithBufferedBlockDispatcher...`);

    const dispatchPromise = pluginRuntime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: cfg,
      dispatcherOptions: {
        responsePrefix: messagesConfig.responsePrefix,
        deliver: async (payload: ReplyPayload, info: { kind: string }): Promise<void> => {
          hasResponse = true;
          log.info('dispatch', `deliver(${info.kind}): ${payload}`);
          if (payload.text) {
            await sendReply(payload.text);
          }
        },
        onError: async (err: unknown): Promise<void> => {
          hasResponse = true;
          log.error('dispatch', `Dispatch error: ${err}`);
          await sendReply(`[错误] ${String(err)}`);
        },
      },
      replyOptions: {},
    });

    // Wait for dispatch to complete
    await dispatchPromise;

    log.info('dispatch', `Dispatch completed, hasResponse: ${hasResponse}`);
  } catch (error) {
    log.error('dispatch', `Message processing failed: ${error}`);
  } finally {
    // Send stopped typing indicator after AI completes (for private messages)
    if (typingIndicatorSent) {
      await sendStoppedTyping(conn, senderId);
    }
  }
}

/**
 * Handle group message event
 */
export async function handleGroupMessage(
  event: {
    time: number;
    self_id: number;
    message_id: number;
    group_id: number;
    user_id: number;
    message: Array<{ type: string; data: Record<string, unknown> }>;
    raw_message: string;
    sender?: {
      nickname?: string;
      card?: string;
    };
  },
  ctx: {
    account: QQConfig;
    cfg: OpenClawConfig;
  },
  conn: ConnectionManager
): Promise<void> {
  // Use async version to fetch file data
  const { content } = await napCatToOpenClawMessageAsync(event.message, conn);

  // Convert content array to plain text for the message body (async to fetch reply data)
  const plainText = await contentToPlainText(content, event.raw_message, conn);

  log.info('dispatch', `Group message from ${event.sender?.nickname || event.sender?.card || event.user_id}: ${plainText}`);

  await dispatchMessage({
    cfg: ctx.cfg,
    chatType: 'group',
    chatId: String(event.group_id),
    senderId: String(event.user_id),
    senderName: event.sender?.nickname || event.sender?.card,
    messageId: String(event.message_id),
    content: plainText,
    timestamp: event.time * 1000,
    conn,
  });
}

/**
 * Handle private message event
 */
export async function handlePrivateMessage(
  event: {
    time: number;
    self_id: number;
    message_id: number;
    user_id: number;
    message: Array<{ type: string; data: Record<string, unknown> }>;
    raw_message: string;
    sender?: {
      nickname?: string;
    };
  },
  ctx: {
    account: QQConfig;
    cfg: OpenClawConfig;
  },
  conn: ConnectionManager
): Promise<void> {

  // Use async version to fetch file data
  const { content } = await napCatToOpenClawMessageAsync(event.message, conn);

  // Convert content array to plain text for the message body (async to fetch reply data)
  const plainText = await contentToPlainText(content, event.raw_message, conn);

  log.info('dispatch', `Private message from ${event.sender?.nickname || event.user_id}: ${plainText}`);

  await dispatchMessage({
    cfg: ctx.cfg,
    chatType: 'direct',
    chatId: String(event.user_id),
    senderId: String(event.user_id),
    senderName: event.sender?.nickname,
    messageId: String(event.message_id),
    content: plainText,
    timestamp: event.time * 1000,
    conn,
  });
}

/**
 * Extract action text from raw_info (e.g., "戳了戳")
 */
function extractPokeActionText(rawInfo?: Array<{ type: string; txt?: string }>): string {
  if (!rawInfo) return '戳了戳';

  // Find the "nor" type item with txt field
  const actionItem = rawInfo.find(item => item.type === 'nor' && item.txt);
  return actionItem?.txt || '戳了戳';
}

/**
 * Handle poke event
 */
export async function handlePokeEvent(
  event: {
    user_id: number;
    target_id: number;
    group_id?: number;
    raw_info?: Array<{ type: string; txt?: string }>;
  },
  ctx: {
    account: QQConfig;
    cfg: OpenClawConfig;
  },
  conn: ConnectionManager
): Promise<void> {
  const actionText = extractPokeActionText(event.raw_info);
  log.info('dispatch', `Poke from ${event.user_id}: ${actionText}`);

  // Convert poke to a text message for AI processing
  const pokeMessage = actionText || '戳了戳';
  const chatType = event.group_id ? 'group' : 'direct';
  const chatId = String(event.group_id || event.user_id);

  await dispatchMessage({
    cfg: ctx.cfg,
    chatType,
    chatId,
    senderId: String(event.user_id),
    senderName: String(event.user_id),
    messageId: `poke_${event.user_id}_${Date.now()}`,
    content: pokeMessage,
    timestamp: Date.now(),
    conn,
  });
}
