/**
 * Message Type Adapters for NapCat <-> OpenClaw conversion
 *
 * 使用映射表驱动的统一消息转换系统
 */

import type {
  NapCatMessage,
  NapCatJsonSegment,
  OpenClawMessage,
  OpenClawJsonContent,
  QQAccount,
} from '../types';
import { Logger as log, extractImageUrl, getEmojiForFaceId, markdownToText } from '../utils/index.js';
import { CQCodeUtils } from '../utils';
import { getMsg } from "../core/request.js";

// =============================================================================
// 工具函数
// =============================================================================

/** 安全提取字符串字段 */
const str = (data: Record<string, unknown>, key: string): string =>
  String(data[key] ?? '');

/** 安全提取数字字段 */
const num = (data: Record<string, unknown>, key: string): number | undefined => {
  const v = data[key];
  return v != null ? parseInt(String(v), 10) : undefined;
};

// =============================================================================
// CQ Code Parsing
// =============================================================================

/** 将 CQNode 转换为 NapCatMessageSegment */
function cqNodeToNapCat(node: { type: string; data: Record<string, unknown> }): NapCatMessage {
  return { type: node.type, data: node.data };
}

/** 解析 CQ 码 */
function parseCQCode(text: string): NapCatMessage[] {
  return CQCodeUtils.parse(text).map(cqNodeToNapCat);
}

/** 标准化消息格式 */
function normalizeMessage(message: NapCatMessage[] | string): NapCatMessage[] {
  if (typeof message === 'string') return parseCQCode(message);
  if (!Array.isArray(message)) {
    log.warn('adapters', `Invalid message format: ${typeof message}`);
    return [{ type: 'text', data: { text: String(message) } }];
  }
  return message;
}

// =============================================================================
// JSON 消息解析
// =============================================================================

function parseJsonSegment(segment: NapCatJsonSegment): OpenClawJsonContent {
  const rawData = segment.data.data.trim();
  let prompt: string | undefined;

  try {
    const jsonData = JSON.parse(rawData) as { prompt?: string };
    if (jsonData?.prompt?.trim()) {
      prompt = jsonData.prompt;
    }
  } catch {
    log.warn('adapters', 'Failed to parse JSON message');
  }

  return { type: 'json', data: rawData, ...(prompt && { prompt }) };
}

// =============================================================================
// 入站转换器 (NapCat -> OpenClaw)
// =============================================================================

type InboundConverter = (data: Record<string, unknown>) => OpenClawMessage | null | Promise<OpenClawMessage | null>;

const inboundConverters: Record<string, InboundConverter> = {
  text: (data) => ({ type: 'text', text: str(data, 'text') }),

  at: (data) => ({
    type: 'at',
    userId: str(data, 'qq'),
    isAll: data.qq === 'all',
  }),

  image: (data) => {
    const url = extractImageUrl(data as { url?: string; file?: string });
    return url ? { type: 'image', url, summary: data.summary as string | undefined } : null;
  },

  reply: async (data) => {
    const response = await getMsg({ message_id: Number(data.id) });
    if (!response.data?.message) return null;
    return {
      type: 'reply',
      messageId: str(data, 'id'),
      message: response.data.raw_message,
      senderId: String(response.data.sender.user_id),
      sender: response.data.sender.nickname,
    };
  },

  video: (data) => ({
    type: 'video',
    url: str(data, 'url'),
    fileSize: num(data, 'file_size'),
  }),

  face: (data) => ({ type: 'text', text: getEmojiForFaceId(str(data, 'id')) }),

  record: (data) => data.path ? {
    type: 'audio',
    path: str(data, 'path'),
    file: str(data, 'file'),
    url: data.url as string | undefined,
    fileSize: num(data, 'file_size'),
  } : null,

  file: (data) => ({
    type: 'file',
    fileId: str(data, 'file'),
    fileSize: num(data, 'file_size'),
  }),

  json: (data) => parseJsonSegment({ type: 'json', data: { data: str(data, 'data') } }),
};

async function napCatToOpenClaw(segment: NapCatMessage): Promise<OpenClawMessage | null> {
  const data = segment.data as Record<string, unknown>;
  const converter = inboundConverters[segment.type];

  if (!converter) {
    log.warn('adapters', `Unknown message type (inbound): ${segment.type}`);
    return null;
  }

  return converter(data);
}

// =============================================================================
// 出站转换器 (OpenClaw -> NapCat)
// =============================================================================

type OutboundConverter = (content: OpenClawMessage, account: QQAccount) => NapCatMessage | null;

const outboundConverters: Record<string, OutboundConverter> = {
  text: (content, account) => ({
    type: 'text',
    data: { text: account.markdownFormat ? markdownToText((content as { text: string }).text) : (content as { text: string }).text },
  }),

  at: (content) => {
    const { isAll, userId } = content as { isAll?: boolean; userId: string };
    return { type: 'at', data: { qq: isAll ? 'all' : userId } };
  },

  image: (content) => {
    const { url } = content as { url: string };
    return { type: 'image', data: { file: url, url } };
  },

  reply: (content) => ({
    type: 'reply',
    data: { id: (content as { messageId: string }).messageId },
  }),

  file: (content) => {
    const c = content as { file?: string; url?: string; fileSize?: number };
    return { type: 'file', data: { file: c.file, url: c.url, file_size: c.fileSize } };
  },

  audio: (content) => {
    const c = content as { file?: string; path?: string; url?: string; fileSize?: number };
    return { type: 'record', data: { file: c.file, path: c.path, url: c.url, file_size: c.fileSize } };
  },
};

function openClawToNapCat(content: OpenClawMessage, account: QQAccount): NapCatMessage | null {
  const converter = outboundConverters[content.type];

  if (!converter) {
    log.warn('adapters', `Unknown content type (outbound): ${content.type}`);
    return null;
  }

  return converter(content, account);
}

// =============================================================================
// 导出 API
// =============================================================================

export async function outboundMessageAdapter(content: OpenClawMessage[], account: QQAccount): Promise<NapCatMessage[]> {
  const segments: NapCatMessage[] = [];
  for (const item of content) {
    const segment = openClawToNapCat(item, account);
    if (segment) segments.push(segment);
  }
  return segments;
}

export async function inboundMessageAdapter(segments: NapCatMessage[] | string): Promise<OpenClawMessage[]> {
  const normalized = normalizeMessage(segments);
  const content: OpenClawMessage[] = [];

  for (const segment of normalized) {
    const result = await napCatToOpenClaw(segment);
    if (result) content.push(result);
  }

  return content;
}

// =============================================================================
// 文本格式化 (供 event-handler 使用)
// =============================================================================

export type TextFormatter = (content: OpenClawMessage) => string | null;

const textFormatters: Record<string, TextFormatter> = {
  text: (c) => (c as { text: string }).text,

  at: (c) => {
    const { isAll, userId } = c as { isAll?: boolean; userId?: string };
    return `[提及]${isAll ? '@全体成员' : `@${userId || 'unknown'}`}`;
  },

  image: (c) => `[图片]${(c as { url?: string }).url || ''}`,

  audio: (c) => `[音频]${(c as { path?: string }).path || ''}`,

  video: (c) => `[视频]${(c as { url?: string }).url || ''}`,

  file: (c) => `[文件]${(c as { fileId?: string }).fileId || ''}`,

  json: (c) => `[JSON]\n\n\`\`\`json\n${(c as { data?: string }).data || ''}\n\`\`\``,

  reply: (c) => {
    const { sender, senderId, message } = c as { sender?: string; senderId?: string; message?: string };
    const senderInfo = sender && senderId ? `${sender}(${senderId})` : '(未知用户)';
    const replyMsg = message ?? '(无法获取原消息)';
    const quotedContent = `${senderInfo}:\n${replyMsg}`.replace(/^/gm, '> ');
    return `[回复]\n\n${quotedContent}`;
  },
};

/** 将 OpenClaw 消息内容转换为纯文本 */
export function formatContentToText(content: OpenClawMessage[]): string {
  return content
    .map(c => textFormatters[c.type]?.(c) ?? null)
    .filter((v): v is string => v !== null)
    .join('\n');
}

// =============================================================================
// 媒体提取 (供 event-handler 使用)
// =============================================================================

interface MediaExtractor {
  check: (content: OpenClawMessage[]) => boolean;
  extract: (content: OpenClawMessage[]) => { type: string; path?: string; url?: string } | undefined;
}

const mediaExtractors: MediaExtractor[] = [
  {
    check: (c) => c.some(x => x.type === 'image'),
    extract: (c) => {
      const img = c.find(x => x.type === 'image') as { url?: string } | undefined;
      return img ? { type: 'image/jpeg', path: img.url, url: img.url } : undefined;
    },
  },
  {
    check: (c) => c.some(x => x.type === 'audio'),
    extract: (c) => {
      const audio = c.find(x => x.type === 'audio') as { path?: string; url?: string } | undefined;
      return audio ? { type: 'audio/amr', path: audio.path, url: audio.url } : undefined;
    },
  },
  {
    check: (c) => c.some(x => x.type === 'file'),
    extract: (c) => {
      const file = c.find(x => x.type === 'file') as { file?: string; url?: string } | undefined;
      return file ? { type: 'application/octet-stream', path: file.file, url: file.url } : undefined;
    },
  },
];

/** 检查是否包含媒体 */
export function hasMediaContent(content: OpenClawMessage[]): boolean {
  return content.some(c => c.type === 'image' || c.type === 'audio' || c.type === 'file');
}

/** 从消息内容提取媒体信息 */
export function extractMedia(content: OpenClawMessage[]): { type: string; path?: string; url?: string } | undefined {
  for (const extractor of mediaExtractors) {
    if (extractor.check(content)) {
      return extractor.extract(content);
    }
  }
  return undefined;
}
