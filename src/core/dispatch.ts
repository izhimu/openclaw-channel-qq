import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/core"
import { createChannelInboundDebouncer, shouldDebounceTextInbound } from "openclaw/plugin-sdk/channel-inbound"
import { createChannelReplyPipeline } from "openclaw/plugin-sdk/channel-reply-pipeline"
import { resolveSendableOutboundReplyParts } from "openclaw/plugin-sdk/reply-payload"
import { recordPendingHistoryEntry } from "openclaw/plugin-sdk/reply-history"
import type {
  OpenClawMessage, QQAccount, QQGroupConfig, QQLoginInfo,
  ProcessInboundParams, InboundMessage
} from '../types';
import {
  getLoginInfo,
  historyCache
} from './runtime.js'
import { sendMsg, setInputStatus } from './request.js'
import { outboundMessageAdapter } from '../adapters/message.js';
import { Logger as log, buildMediaMessage } from '../utils/index.js';
import { QQ_CHANNEL } from "./config.js";

async function send(account: QQAccount, isGroup: boolean, to: string, messageSegments: OpenClawMessage[]): Promise<void> {
  try {
    await sendMsg({
      message_type: isGroup ? 'group' : 'private',
      group_id: isGroup ? to : undefined,
      user_id: !isGroup ? to : undefined,
      message: await outboundMessageAdapter(messageSegments, account),
    });
    log.debug('dispatch', `Sent reply success`);
  } catch (error) {
    log.error('dispatch', `Send failed: ${error}`);
  }
}

function getGroupConfig(groupId: string, config: QQAccount): QQGroupConfig {
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

function mention(account: QQAccount, content: string, groupId: string, targetId?: string, loginInfo?: QQLoginInfo): boolean {
  let config = getGroupConfig(groupId, account)

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
 * 防抖器
 * @param params
 */
function createDebouncer(params: {
  cfg: OpenClawConfig;
  account: { accountId: string };
  runtime: PluginRuntime;
}) {
  return createChannelInboundDebouncer<ProcessInboundParams>({
    cfg: params.cfg,
    channel: QQ_CHANNEL,
    buildKey: (item) => {
      const peerId = item.msg.isGroup
        ? (item.msg.groupId ?? item.msg.senderId)
        : item.msg.senderId;
      return `qq:${item.account.accountId}:${peerId}`;
    },
    shouldDebounce: (item) =>
      shouldDebounceTextInbound({
        text: item.msg.text,
        cfg: item.cfg,
        hasMedia: item.msg.hasMedia,
      }),
    onFlush: async (items) => {
      if (items.length === 0) return;

      const mergedText = items
        .map((item) => item.msg.text)
        .filter(Boolean)
        .join("\n");

      const first = items[0];
      const mergedMsg = {
        ...first.msg,
        text: mergedText,
      };

      await processInboundMessage({
        ...first,
        msg: mergedMsg,
      });
    },
    onError: (err, items) => {
      log.error('dispatch', `debounce flush failed for ${items.length} items:`, err);
    },
  });
}

/**
 * 入站消息解析
 * @param params
 */
async function processInboundMessage(params: ProcessInboundParams): Promise<void> {
  const { cfg, account, runtime, msg } = params;

  const isGroup = msg.isGroup;
  const loginInfo = getLoginInfo();
  const peerId = isGroup ? (msg.groupId ?? msg.senderId) : msg.senderId

  // For group messages, check @mention requirement
  if (isGroup) {
    const isMention = mention(account, msg.text, peerId, msg.targetId, loginInfo);
    if (!isMention) {
      log.debug('dispatch', `Skipping group message (not mentioned)`);
      const groupConfig = getGroupConfig(peerId, account);
      recordPendingHistoryEntry({
        historyMap: historyCache,
        historyKey: peerId,
        limit: groupConfig.historyLimit ?? 20,
        entry: {
          sender: `${msg.senderName}(${msg.senderId})`,
          body: msg.text,
          timestamp: msg.timestamp,
          messageId: msg.messageId,
        },
      })
      return;
    }
  }

  const { channel } = runtime

  // 1.解析路由
  const route = channel.routing.resolveAgentRoute({
    cfg,
    channel: QQ_CHANNEL,
    accountId: account.accountId,
    peer: {
      kind: isGroup ? "group" : "direct",
      id: peerId,
    },
  });

  // 2.构建 Envelope
  const storePath = channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId
  });
  const previousTimestamp = channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const envelopeOptions = channel.reply.resolveEnvelopeFormatOptions(cfg);
  const fromLabel = isGroup ? `group:${peerId}` : (msg.senderName ?? `user:${msg.senderId}`);
  const body = channel.reply.formatAgentEnvelope({
    channel: QQ_CHANNEL,
    from: fromLabel,
    timestamp: msg.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: msg.text,
  });

  // 3.构建消息上下文
  const ctxPayload = channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: msg.text,
    RawBody: msg.text,
    CommandBody: msg.text,
    From: `${QQ_CHANNEL}:${msg.senderId}`,
    To: `${QQ_CHANNEL}:${peerId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "channel" : "direct",
    ConversationLabel: fromLabel,
    SenderId: msg.senderId,
    SenderName: msg.senderName,
    WasMentioned: isGroup ? (msg.wasMentioned ?? false) : undefined,
    Provider: QQ_CHANNEL,
    Surface: QQ_CHANNEL,
    MessageSid: msg.messageId,
    MessageSidFull: msg.messageId,
    Timestamp: msg.timestamp,
    MediaType: msg.media?.type,
    MediaPath: msg.media?.path,
    MediaUrl: msg.media?.url,
    ReplyToId: msg.replyToId,
    OriginatingChannel: QQ_CHANNEL,
    OriginatingTo: `${QQ_CHANNEL}:${peerId}`,
  });

  // 4.记录 Session
  channel.session.recordSessionMetaFromInbound({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
  }).catch((err) => {
    log.error('dispatch', `session record failed: ${err}`);
  });

  // 5.创建 Reply Pipeline
  const { onModelSelected, ...replyPipeline } = createChannelReplyPipeline({
    cfg,
    agentId: route.agentId,
    channel: QQ_CHANNEL,
    accountId: route.accountId,
  });

  // 6.分发 Reply
  await channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg,
    dispatcherOptions: {
      ...replyPipeline,
      onReplyStart: async (): Promise<void> => {
        if (!isGroup) {
          // 输入状态
          await setInputStatus({
            user_id: msg.senderId,
            event_type: 1
          });
        }
      },
      deliver: async (payload) => {
        const reply = resolveSendableOutboundReplyParts(payload);
        if (!reply.hasContent) return;

        const chunkLimit = 4000;
        const chunks = reply.trimmedText
          ? channel.text.chunkMarkdownText(reply.trimmedText, chunkLimit)
          : [];
        const to = msg.replyToId ?? peerId

        const messageSegments: OpenClawMessage[] = []

        for (const chunk of chunks) {
          messageSegments.push({ type: "text", text: chunk });
        }
        if (reply.hasMedia) {
          for (const mediaUrl of reply.mediaUrls) {
            messageSegments.push(buildMediaMessage(mediaUrl));
          }
        }

        await send(account, isGroup, to, messageSegments)
      },
      onError: (err, info) => {
        log.error('dispatch', `${info.kind} reply failed: ${err}`);
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });

  // 7.结束输入状态
  if (!isGroup) {
    await setInputStatus({
      user_id: msg.senderId,
      event_type: 2
    });
  }
}

export function createInboundHandler(params: {
  cfg: OpenClawConfig;
  account: QQAccount;
  runtime: PluginRuntime;
}) {
  const debouncer = createDebouncer(params);

  return async (msg: InboundMessage) => {
    const canDebounce = shouldDebounceTextInbound({
      text: msg.text,
      cfg: params.cfg,
      hasMedia: msg.hasMedia,
    });

    if (canDebounce && debouncer.debounceMs > 0) {
      await debouncer.debouncer.enqueue({
        ...params,
        msg,
      });
    } else {
      await processInboundMessage({
        ...params,
        msg,
      });
    }
  };
}
