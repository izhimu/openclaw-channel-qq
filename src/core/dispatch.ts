/**
 * Message Dispatch Module
 * Handles routing and dispatching incoming messages to the AI
 */

import type { ReplyPayload } from "openclaw/plugin-sdk";
import type {
  DispatchMessageMedia,
  DispatchMessageParams,
  DispatchMessageReply,
  OpenClawMessage,
} from '../types/index.js';
import { CHANNEL_ID } from '../types/index.js';
import { getRuntime, getContext } from './runtime.js'
import { getMsg, getFile, sendMsg, setInputStatus } from './request.js'
import { napCatToOpenClawMessage } from '../adapters/message.js';
import { Logger as log, markdownToText } from '../utils/index.js';

/**
 * Convert OpenClaw message content array to plain text
 * For images, includes the URL so AI models can access them
 * For replies, includes quoted message content if available
 */
async function contentToPlainText(content: OpenClawMessage[]): Promise<string> {
  return content
    .filter(c => c.type !== 'reply' && c.type !== 'image' && c.type !== 'audio' && c.type !== 'file')
    .map((c) => {
      switch (c.type) {
        case 'text':
          return c.text;
        case 'at':
          return c.isAll ? '@全体成员' : `@${c.userId}`;
        case 'json':
          return `[JSON]\n\`\`\`json\n${c.data}\n\`\`\``;
        default:
          return '';
      }
    }).join('');
}

async function contextToMedia(content: OpenClawMessage[]): Promise<DispatchMessageMedia | undefined> {
  const hasMedia = content.some(c => c.type === 'image' || c.type === 'audio' || c.type === 'file');
  if (!hasMedia) {
    return;
  }
  const image = content.find(c => c.type === 'image');
  if (image) {
    return {
      type: 'image/jpeg',
      path: image.url,
      url: image.url,
    };
  }
  const audio = content.find(c => c.type === 'audio');
  if (audio) {
    return {
      type: 'audio/amr',
      path: audio.path,
      url: audio.url,
    };
  }
  const file = content.find(c => c.type === 'file');
  if (file) {
    const fileInfo = await getFile({ file_id: file.fileId });
    if (fileInfo.data?.file == undefined) {
      return;
    }
    return {
      type: 'application/octet-stream',
      path: fileInfo.data?.file,
      url: fileInfo.data?.url,
    };
  }
  return;
}

async function contextToReply(content: OpenClawMessage[]): Promise<DispatchMessageReply | undefined> {
  const hasReply = content.some(c => c.type === 'reply');
  if (!hasReply) {
    return;
  }
  const reply = content.find(c => c.type === 'reply');
  if (!reply) {
    return;
  }
  const response = await getMsg({
    message_id: Number(reply.messageId),
  });
  if (response.data?.message == undefined) {
    return;
  }
  const replyMessage = await napCatToOpenClawMessage(response.data?.message);
  const text = await contentToPlainText(replyMessage);
  return {
    id: reply.messageId,
    content: text,
    sender: String(response.data?.sender.user_id)
  };
}

/**
 * Dispatch an incoming message to the AI for processing
 */
export async function dispatchMessage(params: DispatchMessageParams): Promise<void> {
  const { chatType, chatId, senderId, senderName, messageId, content, media, reply, timestamp } = params;

  const runtime = getRuntime();
  if (!runtime) {
    log.warn('dispatch', `Plugin runtime not available`);
    return;
  }
  const context = getContext();
  if (!context) {
    log.warn('dispatch', `No gateway context`);
    return;
  }

  const isGroup = chatType === 'group';
  const peerId = isGroup ? `group:${chatId}` : senderId;

  if (!isGroup) {
    // 输入状态
    await setInputStatus({
      user_id: senderId,
      event_type: 1
    });
  }

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg: context.cfg,
    channel: CHANNEL_ID,
    peer: {
      kind: isGroup ? 'group' : 'dm',
      id: peerId,
    },
  });
  const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(context.cfg);
  const body = runtime.channel.reply.formatInboundEnvelope({
    channel: CHANNEL_ID,
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
  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
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
      Provider: CHANNEL_ID,
      Surface: CHANNEL_ID,
      MessageSid: messageId,
      Timestamp: timestamp,
      ReplyToId: reply?.id,
      ReplyToBody: reply?.content,
      ReplyToSender: reply?.sender,
      ReplyToIsQuote: !!reply,
      MediaType: media?.type,
      MediaPath: media?.path,
      MediaUrl: media?.url,
      OriginatingChannel:
      CHANNEL_ID,
      OriginatingTo:
      toAddress,
    })
  ;

  log.info('dispatch', `Dispatching to agent ${route.agentId}, session: ${route.sessionKey}`);

  const sendReply = async (text: string): Promise<void> => {
    const messageSegments = [{ type: 'text', data: { text: markdownToText(text) } }];

    try {
      await sendMsg({
        message_type: isGroup ? 'group' : 'private',
        group_id: isGroup ? chatId : undefined,
        user_id: !isGroup ? chatId : undefined,
        message: messageSegments,
      })
      log.info('dispatch', `Sent reply: ${text.slice(0, 100)}`);
    } catch (error) {
      log.error('dispatch', `Send failed: ${error}`);
    }
  };

  const messagesConfig = runtime.channel.reply.resolveEffectiveMessagesConfig(context.cfg, route.agentId);
  log.info('dispatch', `Messages config: ${JSON.stringify(messagesConfig)}`);

  let hasResponse = false;

  try {
    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: context.cfg,
      dispatcherOptions: {
        humanDelay: {
          mode: "off"
        },
        responsePrefix: messagesConfig.responsePrefix,
        deliver: async (payload: ReplyPayload, info: { kind: string }): Promise<void> => {
          hasResponse = true;
          log.info('dispatch', `deliver(${info.kind}): ${JSON.stringify(payload)}`);
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

    log.info('dispatch', `Dispatch completed, hasResponse: ${hasResponse}`);
  } catch (error) {
    log.error('dispatch', `Message processing failed: ${error}`);
  } finally {
    if (!isGroup) {
      // 输入状态
      await setInputStatus({
        user_id: senderId,
        event_type: 2
      });
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
  }
): Promise<void> {
  const content = await napCatToOpenClawMessage(event.message);

  const plainText = await contentToPlainText(content);
  const media = await contextToMedia(content);
  const reply = await contextToReply(content);

  log.info('dispatch', `Group message from ${event.sender?.nickname || event.sender?.card || event.user_id}: ${plainText}, media: ${media != undefined}, reply: ${reply != undefined}`);

  await dispatchMessage({
    chatType: 'group',
    chatId: String(event.group_id),
    senderId: String(event.user_id),
    senderName: event.sender?.nickname || event.sender?.card,
    messageId: String(event.message_id),
    content: plainText,
    media,
    reply,
    timestamp: event.time * 1000,
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
  }
): Promise<void> {
  const content = await napCatToOpenClawMessage(event.message);

  const plainText = await contentToPlainText(content);
  const media = await contextToMedia(content);
  const reply = await contextToReply(content);

  log.info('dispatch', `Private message from ${event.sender?.nickname || event.user_id}: ${plainText}, media: ${media != undefined}, reply: ${reply != undefined}`);

  await dispatchMessage({
    chatType: 'direct',
    chatId: String(event.user_id),
    senderId: String(event.user_id),
    senderName: event.sender?.nickname,
    messageId: String(event.message_id),
    content: plainText,
    media,
    reply,
    timestamp: event.time * 1000,
  });
}

/**
 * Handle poke event
 */
function extractPokeActionText(rawInfo?: Array<{ type: string; txt?: string }>): string {
  if (!rawInfo) return '戳了戳';
  const actionItem = rawInfo.find(item => item.type === 'nor' && item.txt);
  return actionItem?.txt || '戳了戳';
}

export async function handlePokeEvent(
  event: {
    user_id: number;
    target_id: number;
    group_id?: number;
    raw_info?: Array<{ type: string; txt?: string }>;
  }
): Promise<void> {
  const actionText = extractPokeActionText(event.raw_info);
  log.info('dispatch', `Poke from ${event.user_id}: ${actionText}`);

  const pokeMessage = actionText || '戳了戳';
  const chatType = event.group_id ? 'group' : 'direct';
  const chatId = String(event.group_id || event.user_id);

  await dispatchMessage({
    chatType,
    chatId,
    senderId: String(event.user_id),
    senderName: String(event.user_id),
    messageId: `poke_${event.user_id}_${Date.now()}`,
    content: `[动作] ${pokeMessage}`,
    timestamp: Date.now(),
  });
}
