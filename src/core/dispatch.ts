/**
 * Message Dispatch Module
 * Handles routing and dispatching incoming messages to the AI
 */

import type { AccountConfig, OpenClawMessageContent } from '../types/index.js';
import type { ConnectionManager } from './connection.js';
import { napCatToOpenClawMessage } from '../adapters/message.js';
import { logDebug, logWarn } from '../utils/index.js';

/**
 * Convert OpenClaw message content array to plain text
 * For images, includes the URL so AI models can access them
 */
function contentToPlainText(content: OpenClawMessageContent[]): string {
  return content.map((c) => {
    switch (c.type) {
      case 'text':
        return c.text;
      case 'at':
        return c.isAll ? '@全体成员' : `@${c.userId}`;
      case 'image':
        // Include image URL so AI models can access the image
        return c.url ? `[图片](${c.url})` : '[图片]';
      case 'reply':
        return '[回复]';
      default:
        return '';
    }
  }).join('');
}

/**
 * Message dispatch parameters
 */
export interface DispatchMessageParams {
  accountId: string;
  cfg: unknown;
  log?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
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
  const { accountId, cfg, log, chatType, chatId, senderId, senderName, messageId, content, timestamp, conn } = params;

  // Import here to avoid circular dependency
  const { getNapCatRuntime } = await import('./runtime.js');
  const pluginRuntime = getNapCatRuntime();

  if (!pluginRuntime) {
    logWarn('dispatch', `Plugin runtime not available for account ${accountId}`);
    return;
  }

  const isGroup = chatType === 'group';
  const peerId = isGroup ? `group:${chatId}` : senderId;

  // Resolve agent route
  const route = pluginRuntime.channel.routing.resolveAgentRoute({
    cfg: cfg as any,
    channel: 'openclaw-channel-qq',
    accountId,
    peer: {
      kind: isGroup ? 'group' : 'dm',
      id: peerId,
    },
  });

  const envelopeOptions = pluginRuntime.channel.reply.resolveEnvelopeFormatOptions(cfg as any);

  // Format inbound message
  const body = pluginRuntime.channel.reply.formatInboundEnvelope({
    channel: 'QQ',
    from: senderName || senderId,
    timestamp,
    body: content,
    chatType: isGroup ? 'group' : 'direct',
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
    ChatType: isGroup ? 'group' : 'direct',
    SenderId: senderId,
    SenderName: senderName,
    Provider: 'openclaw-channel-qq',
    Surface: 'openclaw-channel-qq',
    MessageSid: messageId,
    Timestamp: timestamp,
    OriginatingChannel: 'openclaw-channel-qq',
    OriginatingTo: toAddress,
  });

  log?.info(`[openclaw-channel-qq:${accountId}] Dispatching to agent ${route.agentId}, session: ${route.sessionKey}`);

  // Send function for delivering replies
  const sendReply = async (text: string): Promise<void> => {
    const messageSegments = [{ type: 'text', data: { text } }];

    try {
      if (isGroup) {
        await conn.sendRequest('send_group_msg', {
          group_id: Number(chatId),
          message: messageSegments,
        });
      } else {
        await conn.sendRequest('send_private_msg', {
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
  const messagesConfig = pluginRuntime.channel.reply.resolveEffectiveMessagesConfig(cfg as any, route.agentId);
  log?.info(`[openclaw-channel-qq:${accountId}] Messages config: ${JSON.stringify(messagesConfig)}`);

  // Track if we got any response
  let hasResponse = false;

  // Dispatch the message for AI processing
  try {
    log?.info(`[openclaw-channel-qq:${accountId}] Calling dispatchReplyWithBufferedBlockDispatcher...`);

    const dispatchPromise = pluginRuntime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: cfg as any,
      dispatcherOptions: {
        responsePrefix: messagesConfig.responsePrefix,
        deliver: async (payload: { text?: string }, info: { kind: string }): Promise<void> => {
          hasResponse = true;
          log?.info(`[openclaw-channel-qq:${accountId}] deliver(${info.kind}): ${payload.text?.slice(0, 100) || '(empty)'}`);
          if (payload.text) {
            await sendReply(payload.text);
          }
        },
        onError: async (err: unknown): Promise<void> => {
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

/**
 * Handle group message event
 */
export async function handleGroupMessage(
  accountId: string,
  event: {
    time: number;
    self_id: number;
    message_id: number;
    group_id: number;
    user_id: number;
    message: Array<{ type: string; data: Record<string, unknown> }>;
    sender?: {
      nickname?: string;
      card?: string;
    };
  },
  ctx: {
    account: AccountConfig;
    cfg: unknown;
    log?: {
      debug: (message: string, ...args: unknown[]) => void;
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
    };
  },
  connectionManager: {
    getConnection: (id: string) => ConnectionManager | undefined;
  }
): Promise<void> {
  const { cfg, log } = ctx;
  const conn = connectionManager.getConnection(accountId);
  if (!conn) return;

  // Cache bot user ID
  if (event.self_id) {
    conn.setBotUserId(event.self_id);
  }

  const botUserId = conn.getBotUserId();
  const { content } = napCatToOpenClawMessage(event.message, botUserId);

  // Convert content array to plain text for the message body
  const plainText = contentToPlainText(content);

  log?.info(`[openclaw-channel-qq:${accountId}] Group message from ${event.sender?.nickname || event.sender?.card || event.user_id}: ${plainText}`);

  await dispatchMessage({
    accountId,
    cfg,
    log,
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
  accountId: string,
  event: {
    time: number;
    self_id: number;
    message_id: number;
    user_id: number;
    message: Array<{ type: string; data: Record<string, unknown> }>;
    sender?: {
      nickname?: string;
    };
  },
  ctx: {
    account: AccountConfig;
    cfg: unknown;
    log?: {
      debug: (message: string, ...args: unknown[]) => void;
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
    };
  },
  connectionManager: {
    getConnection: (id: string) => ConnectionManager | undefined;
  }
): Promise<void> {
  const { cfg, log } = ctx;
  const conn = connectionManager.getConnection(accountId);
  if (!conn) return;

  // Cache bot user ID
  if (event.self_id) {
    conn.setBotUserId(event.self_id);
  }

  const { content } = napCatToOpenClawMessage(event.message);

  // Convert content array to plain text for the message body
  const plainText = contentToPlainText(content);

  log?.info(`[openclaw-channel-qq:${accountId}] Private message from ${event.sender?.nickname || event.user_id}: ${plainText}`);

  await dispatchMessage({
    accountId,
    cfg,
    log,
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
 * Handle poke event
 */
export async function handlePokeEvent(
  accountId: string,
  event: {
    user_id: number;
    target_id: number;
    group_id?: number;
  },
  ctx: {
    account: AccountConfig;
    cfg: unknown;
    log?: {
      debug: (message: string, ...args: unknown[]) => void;
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
    };
  },
  connectionManager: {
    getConnection: (id: string) => ConnectionManager | undefined;
  }
): Promise<void> {
  const conn = connectionManager.getConnection(accountId);
  if (!conn) return;

  const botUserId = conn.getBotUserId();
  if (botUserId && event.target_id !== botUserId) return;

  ctx.log?.info(`[openclaw-channel-qq:${accountId}] Poke from ${event.user_id}`);
  // Poke events don't trigger AI responses, just log them
}
