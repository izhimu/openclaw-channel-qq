/**
 * Message Dispatch Module
 * Handles routing and dispatching incoming messages to the AI
 */

import {
  type ReplyPayload,
  buildPendingHistoryContextFromMap,
  clearHistoryEntries,
  createReplyPrefixOptions,
  recordPendingHistoryEntry,
  resolveInboundRouteEnvelopeBuilderWithRuntime,
} from "openclaw/plugin-sdk";
import type {
  DispatchMessageMedia,
  DispatchMessageParams,
  OpenClawMessage, QQConfig, QQGroupConfig, QQLoginInfo,
} from '../types';
import {
  getRuntime,
  getContext,
  getSession,
  clearSession,
  updateSession,
  getLoginInfo,
  historyCache
} from './runtime.js'
import { getFile, sendMsg, setInputStatus } from './request.js'
import { napCatToOpenClawMessage, openClawToNapCatMessage } from '../adapters/message.js';
import { Logger as log, markdownToText, buildMediaMessage } from '../utils/index.js';
import { CHANNEL_ID } from "./config.js";
import { isAllowedQQCommand, shouldProcessCommands } from "./commands.js";
import {
  resolveQQCommandAuthorization,
  getQQConfigByChatType,
  type QQCommandAuthorization,
} from "./auth.js";

/**
 * Convert OpenClaw message content array to plain text
 * For images, includes the URL so AI models can access them
 * For replies, includes quoted message content if available
 */
async function contentToPlainText(content: OpenClawMessage[]): Promise<string> {
  const results = await Promise.all(
    content.map(async (c) => {
      switch (c.type) {
        case 'text':
          return c.text;
        case 'at':
          const target = c.isAll ? '@全体成员' : `@${c.userId}`;
          return `[提及]${target}`;
        case 'image':
          return `[图片]${c.url}`;
        case 'audio':
          return `[音频]${c.path}`;
        case 'video':
          return `[视频]${c.url}`;
        case 'file': {
          const fileInfo = await getFile({ file_id: c.fileId });
          if (!fileInfo.data?.file) return null;
          return `[文件]${fileInfo.data.file}`;
        }
        case 'json':
          return `[JSON]\n\n\`\`\`json\n${c.data}\n\`\`\``;
        case 'reply': {
          const senderInfo = c.sender && c.senderId ? `${c.sender}(${c.senderId})` : '(未知用户)';
          const replyMsg = c.message ?? '(无法获取原消息)';
          const quotedContent = `${senderInfo}:\n${replyMsg}`.replace(/^/gm, '> ');
          return `[回复]\n\n${quotedContent}`;
        }
        default:
          return null;
      }
    })
  );
  return results.filter((v): v is string => v !== null).join('\n');
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
  const contextText = text.replace(/NO_REPLY\s*$/, '');
  const context = getContext();
  if (!context) {
    log.warn('dispatch', `No gateway context`);
    return;
  }
  const messageSegments = [{
    type: 'text',
    data: { text: context.account.markdownFormat ? markdownToText(contextText) : contextText }
  }];

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
  let { chatType, chatId, senderId, senderName, messageId, content, media, timestamp, targetId } = params;

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
  const config = context.account;
  const loginInfo = getLoginInfo();

  // Command Processing
  // Commands are handled by OpenClaw's native system through the reply flow
  // Group commands do NOT require @mention (per spec requirement)
  const commandResult = await commandHandler({
    content,
    isGroup,
    chatId,
    loginInfo,
  });

  // Update content if command handler modified it
  if (commandResult.content !== undefined) {
    content = commandResult.content;
  }

  // For non-command group messages, check @mention requirement
  // Command messages bypass the @mention check (per spec)
  if (isGroup && !commandResult.isCommand) {
    const isMention = mention(content, chatId, targetId, loginInfo);
    if (!isMention) {
      log.debug('dispatch', `Skipping group message (not mentioned)`);
      const groupConfig = getGroupConfig(chatId, config);
      recordPendingHistoryEntry({
        historyMap: historyCache,
        historyKey: chatId,
        limit: groupConfig.historyLimit ?? 20,
        entry: {
          sender: `${senderName}(${senderId})`,
          body: content,
          timestamp: timestamp,
          messageId: messageId,
        },
      })
      return;
    }
  }

  const { route, buildEnvelope } = resolveInboundRouteEnvelopeBuilderWithRuntime({
    cfg: context.cfg,
    channel: CHANNEL_ID,
    accountId: context.accountId,
    peer: {
      kind: isGroup ? ("group" as const) : ("direct" as const),
      id: chatId,
    },
    runtime: runtime.channel,
    sessionStore: context.cfg.session?.store
  });

  // 终止信号
  const session = getSession(route.sessionKey);
  if (session.abortController) {
    session.abortController.abort();
    session.aborted = true;
    log.info('dispatch', `Aborted previous session`)
  }

  if (isGroup) {
    const groupConfig = getGroupConfig(chatId, config);
    content = buildPendingHistoryContextFromMap({
      historyMap: historyCache,
      historyKey: chatId,
      limit: groupConfig.historyLimit ?? 20,
      currentMessage: content,
      formatEntry: (e) => `${e.sender}: ${e.body}`,
    })
  }

  const fromLabel = isGroup ? `group:${chatId}` : senderName || `user:${senderId}`;
  const { storePath, body } = buildEnvelope({
    channel: CHANNEL_ID,
    from: fromLabel,
    body: content,
    timestamp,
  });
  log.debug('dispatch', `Inbound envelope: ${body}`)
  const fromAddress = `qq:${fromLabel}`;
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
    ConversationLabel: fromLabel,
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
    CommandAuthorized: commandResult.isCommand,
    OwnerAllowFrom: ["*"],
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

  // 使用原生回复前缀配置系统
  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: context.cfg,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId: context.accountId,
  });

  try {
    session.abortController = new AbortController()
    updateSession(route.sessionKey, session)
    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: context.cfg,
      dispatcherOptions: {
        ...prefixOptions,
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
          if (session.aborted) {
            session.aborted = false;
            log.info('dispatch', `aborted skipping`)
            return;
          }

          if (isGroup) {
            clearHistoryEntries({ historyMap: historyCache, historyKey: chatId })
          }
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
      replyOptions: {
        abortSignal: session.abortController?.signal,
        onModelSelected,
      },
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
    clearSession(route.sessionKey);
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
  const senderId = event.user_id.toString();
  const groupId = event.group_id.toString();

  // 使用新的统一授权系统
  const auth = checkAuthorization({
    senderId,
    isGroup: true,
    groupId,
  });

  if (!auth.isAuthorizedSender) {
    log.info('dispatch', `Ignoring group message from ${senderId}: ${auth.denialReason}`)
    return;
  }

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
  const senderId = event.user_id.toString();

  // 使用新的统一授权系统
  const auth = checkAuthorization({
    senderId,
    isGroup: false,
  });

  if (!auth.isAuthorizedSender) {
    log.info('dispatch', `Ignoring private message from ${senderId}: ${auth.denialReason}`)
    return;
  }

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
  const senderId = event.user_id.toString();
  const isGroup = !!event.group_id;

  // 使用新的统一授权系统
  const auth = checkAuthorization({
    senderId,
    isGroup,
    groupId: event.group_id?.toString(),
  });

  if (!auth.isAuthorizedSender) {
    log.info('dispatch', `Poke from ${senderId} is not allowed: ${auth.denialReason}`)
    return;
  }

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
    content: `[动作]${pokeMessage}`,
    timestamp: Date.now(),
    targetId: String(event.target_id),
  });
}

function getGroupConfig(groupId: string, config: QQConfig): QQGroupConfig {
  log.debug('dispatch', `All Custom config: ${JSON.stringify(config.messageGroupsCustom)}`)
  let groupConfig = config.messageGroupsCustom[groupId];
  if (!groupConfig) {
    groupConfig = config.messageGroup
    log.debug('dispatch', `Use global config: ${JSON.stringify(groupConfig)}`)
  } else {
    groupConfig = {
      ...config.messageGroup,
      ...groupConfig,
    }
  }
  log.debug('dispatch', `Final config: ${JSON.stringify(groupConfig)}`)
  return groupConfig
}

/**
 * 使用新的统一授权系统进行授权检查
 *
 * @returns 授权结果，包含 isAuthorizedSender 和其他信息
 */
function checkAuthorization(params: {
  senderId: string;
  isGroup: boolean;
  groupId?: string;
}): QQCommandAuthorization {
  const context = getContext();
  if (!context) {
    log.warn('dispatch', `No gateway context`);
    return {
      providerId: "qq",
      ownerList: [],
      senderId: params.senderId,
      senderIsOwner: false,
      isAuthorizedSender: false,
      denialReason: "default_deny",
    };
  }

  const qqConfig = getQQConfigByChatType(
    params.isGroup,
    params.groupId,
    context.account
  );

  const fromLabel = params.isGroup
    ? `qq:group:${params.groupId}`
    : `qq:user:${params.senderId}`;
  const toLabel = params.isGroup
    ? `qq:group:${params.groupId}`
    : `qq:user:${params.senderId}`;

  return resolveQQCommandAuthorization({
    senderId: params.senderId,
    from: fromLabel,
    to: toLabel,
    cfg: context.cfg,
    qqConfig,
  });
}

function mention(content: string, groupId: string, targetId?: string, loginInfo?: QQLoginInfo): boolean {
  const context = getContext();
  if (!context) {
    log.warn('dispatch', `No gateway context`);
    return false;
  }
  let config = getGroupConfig(groupId, context.account)

  const isMentionEnabled = !!config?.requireMention;
  const isPokeEnabled = !!config?.requirePoke;
  const isWakeEnabled = !!config?.wakeWord?.trim();

  if (!isMentionEnabled && !isPokeEnabled && !isWakeEnabled) {
    log.debug('dispatch', 'All requires are disabled, returning true by default.');
    return true;
  }

  const requireMention = isMentionEnabled &&
    (content.includes('[提及]@全体成员') ||
      (!!loginInfo?.userId && content.includes(`[提及]@${loginInfo.userId}`)));

  const requirePoke = isPokeEnabled &&
    (content.includes('[动作]') && targetId === loginInfo?.userId);

  const requireWake = isWakeEnabled &&
    content.includes(config.wakeWord ?? "");

  log.debug('dispatch', `Require mention: ${requireMention}, require poke: ${requirePoke}, require wake: ${requireWake}`);

  return requireMention || requirePoke || requireWake;
}

/**
 * Handle command processing for incoming messages
 *
 * Commands are filtered through a whitelist and processed by OpenClaw's native
 * command system through the reply flow (when CommandAuthorized is set).
 *
 * Key behaviors:
 * - Commands in whitelist: pass through to native system (no @mention required per spec)
 * - Commands NOT in whitelist: treated as regular text
 * - Non-command messages: continue to normal AI processing
 *
 * @returns Object with shouldContinue flag and optional modified content
 */
async function commandHandler(params: {
  content: string;
  isGroup: boolean;
  chatId: string;
  loginInfo: QQLoginInfo;
}): Promise<{ shouldContinue: boolean; content?: string; isCommand: boolean }> {
  const { content } = params;

  // Check if this is a command message
  if (!shouldProcessCommands(content)) {
    return { shouldContinue: true, content, isCommand: false };
  }

  // Check whitelist - only allowed commands should be processed
  if (!isAllowedQQCommand(content)) {
    // Command not in whitelist - treat as regular text
    // The native system won't recognize it as a command
    log.info("dispatch", `Command not in whitelist, treating as regular text`);
    return { shouldContinue: true, content, isCommand: false };
  }

  // Command is in whitelist
  // Let it pass through to the native reply flow which will handle it
  // The native system will process the command and handle session reset etc.
  log.info("dispatch", `Whitelisted command detected, will be processed by native system`);
  return { shouldContinue: true, content, isCommand: true };
}