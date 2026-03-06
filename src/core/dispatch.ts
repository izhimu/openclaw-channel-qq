/**
 * Message Dispatch Module
 * Handles routing and dispatching incoming messages to the AI
 */

import { ReplyPayload, resolveInboundRouteEnvelopeBuilderWithRuntime } from "openclaw/plugin-sdk";
import type {
  DispatchMessageMedia,
  DispatchMessageParams,
  OpenClawMessage,
} from '../types';
import { getRuntime, getContext } from './runtime.js'
import { getFile, sendMsg, setInputStatus } from './request.js'
import { napCatToOpenClawMessage, openClawToNapCatMessage } from '../adapters/message.js';
import { Logger as log, markdownToText, buildMediaMessage } from '../utils/index.js';
import { CHANNEL_ID } from "./config.js";

/**
 * Convert OpenClaw message content array to plain text
 * For images, includes the URL so AI models can access them
 * For replies, includes quoted message content if available
 */
async function contentToPlainText(content: OpenClawMessage[]): Promise<string> {
  return content
    .filter(c => c.type !== 'image' && c.type !== 'audio' && c.type !== 'file')
    .map((c) => {
      switch (c.type) {
        case 'text':
          return `${c.text}`;
        case 'at':
          return c.isAll ? '@全体成员' : `@${c.userId}`;
        case 'json':
          return `[JSON]\n\`\`\`json\n${c.data}\n\`\`\``;
        case 'reply':
          const senderInfo = c.sender && c.senderId ? `${c.sender}(${c.senderId})` : '未知用户';
          const replyMsg = c.message ?? '[无法获取原消息]';
          let replyContent = `${senderInfo}:\n${replyMsg}`;
          replyContent = replyContent.split('\n').map(line => `> ${line}`).join('\n');
          return `[回复]\n${replyContent}\n`;
        default:
          return '';
      }
    }).join('\n');
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

async function sendText(isGroup: boolean, chatId: string, text: string): Promise<void> {
  const cleanText = text.replace(/NO_REPLY\s*$/, '');
  const messageSegments = [{ type: 'text', data: { text: markdownToText(cleanText) } }];

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
}

async function sendMedia(isGroup: boolean, chatId: string, mediaUrl: string): Promise<void> {
  const content: OpenClawMessage[] = [buildMediaMessage(mediaUrl)];

  try {
    await sendMsg({
      message_type: isGroup ? 'group' : 'private',
      group_id: isGroup ? chatId : undefined,
      user_id: !isGroup ? chatId : undefined,
      message: openClawToNapCatMessage(content),
    });
    log.info('dispatch', `Sent reply: ${mediaUrl.slice(0, 100)}`);
  } catch (error) {
    log.error('dispatch', `Send failed: ${error}`);
  }
}

/**
 * Dispatch an incoming message to the AI for processing
 */
export async function dispatchMessage(params: DispatchMessageParams): Promise<void> {
  const { chatType, chatId, senderId, senderName, messageId, content, media, timestamp } = params;

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
  const peerId = isGroup ? `qq:group:${chatId}` : `qq:${senderId}`;

  const { route, buildEnvelope } = resolveInboundRouteEnvelopeBuilderWithRuntime({
    cfg: context.cfg,
    channel: CHANNEL_ID,
    accountId: context.accountId,
    peer: {
      kind: isGroup ? 'group' : 'direct',
      id: peerId,
    },
    // @ts-ignore
    runtime: runtime.channel,
    sessionStore: context.cfg.session?.store
  });

  const { storePath, body } = buildEnvelope({
    channel: CHANNEL_ID,
    from: senderName || senderId,
    body: content,
    timestamp,
  });
  log.debug('dispatch', `Inbound envelope: ${body}`)
  const fromAddress = peerId;
  const toAddress = `qq:${chatId}`;
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
    MediaType: media?.type,
    MediaPath: media?.path,
    MediaUrl: media?.url,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: toAddress,
  });

  log.info('dispatch', `Dispatching to agent ${route.agentId}, session: ${route.sessionKey}`);

  await runtime.channel.session.recordInboundSession({
    storePath,
    sessionKey: route.sessionKey,
    ctx: ctxPayload,
    onRecordError(err): void {
      log.error('dispatch', `Failed to record inbound session: ${err}`);
    },
  });

  const messagesConfig = runtime.channel.reply.resolveEffectiveMessagesConfig(context.cfg, route.agentId);

  try {
    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: context.cfg,
      dispatcherOptions: {
        humanDelay: {
          mode: "off"
        },
        responsePrefix: messagesConfig.responsePrefix,
        onReplyStart: async (): Promise<void> => {
          if (!isGroup) {
            // 输入状态
            await setInputStatus({
              user_id: senderId,
              event_type: 1
            });
          }
        },
        deliver: async (payload: ReplyPayload, info: { kind: string }): Promise<void> => {
          log.info('dispatch', `deliver(${info.kind}): ${JSON.stringify(payload)}`);

          if (payload.text && !payload.text.startsWith('MEDIA:')) {
            await sendText(isGroup, chatId, payload.text);
          }
          if (payload.text && payload.text.startsWith('MEDIA:')) {
            await sendMedia(isGroup, chatId, payload.text.replace('MEDIA:', ''));
          }
          if (payload.mediaUrl) {
            await sendMedia(isGroup, chatId, payload.mediaUrl);
          }
          if (payload.mediaUrls && payload.mediaUrls.length > 0) {
            for (const mediaUrl of payload.mediaUrls) {
              await sendMedia(isGroup, chatId, mediaUrl);
            }
          }
        },
        onError: async (err: unknown): Promise<void> => {
          log.error('dispatch', `Dispatch error: ${err}`);
          await sendText(isGroup, chatId, `[错误]\n${String(err)}`);
        },
      },
      replyOptions: {},
    });

    log.info('dispatch', `Dispatch completed`);
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

  log.info('dispatch', `Group message from ${event.sender?.nickname || event.sender?.card || event.user_id}: ${plainText}, media: ${media != undefined}`);

  await dispatchMessage({
    chatType: 'group',
    chatId: String(event.group_id),
    senderId: String(event.user_id),
    senderName: event.sender?.nickname || event.sender?.card,
    messageId: String(event.message_id),
    content: plainText,
    media,
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

  log.info('dispatch', `Private message from ${event.sender?.nickname || event.user_id}: ${plainText}, media: ${media != undefined}`);

  await dispatchMessage({
    chatType: 'direct',
    chatId: String(event.user_id),
    senderId: String(event.user_id),
    senderName: event.sender?.nickname,
    messageId: String(event.message_id),
    content: plainText,
    media,
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
    content: `[动作]\n${pokeMessage}`,
    timestamp: Date.now(),
  });
}
