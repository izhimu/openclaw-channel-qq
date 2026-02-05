/**
 * Message Type Adapters for NapCat <-> OpenClaw conversion
 *
 * Optimized for maintainability with clear structure and minimal duplication.
 */

import type {
  NapCatMessageSegment,
  NapCatFileSegment,
  NapCatJsonSegment,
  OpenClawMessageContent,
  OpenClawJsonContent,
  GetMsgData,
} from '../types/index.js';
import { Logger as log, extractImageUrl, getEmojiForFaceId } from '../utils/index.js';
import { CQCodeUtils, type CQNode } from '../utils/cqcode.js';
import type { ConnectionManager } from "../core/connection.js";

// =============================================================================
// CQ Code Parsing
// =============================================================================

/**
 * Convert CQNode to NapCatMessageSegment
 */
function cqNodeToNapCatSegment(node: CQNode): NapCatMessageSegment {
  return {
    type: node.type,
    data: node.data,
  } as NapCatMessageSegment;
}

/**
 * Parse CQ codes using CQCodeUtils and convert to NapCatMessageSegment[]
 */
function parseCQCode(text: string): NapCatMessageSegment[] {
  const nodes = CQCodeUtils.parse(text);
  return nodes.map(cqNodeToNapCatSegment);
}

/**
 * Normalize message to segments array (handles string or array format)
 */
function normalizeMessageSegments(message: NapCatMessageSegment[] | string): NapCatMessageSegment[] {
  if (typeof message === 'string') {
    return parseCQCode(message);
  }
  if (!Array.isArray(message)) {
    log.warn('adapters', `Invalid message format: ${typeof message}`);
    return [{ type: 'text', data: { text: String(message) } }];
  }
  return message;
}

// =============================================================================
// JSON Message Parsing
// =============================================================================

interface JsonMessageData {
  prompt?: string;
  app?: string;
  desc?: string;
  view?: string;
  meta?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

function parseJsonSegment(segment: NapCatJsonSegment): OpenClawJsonContent | OpenClawMessageContent | null {
  try {
    // Trim whitespace and newlines from the raw data
    // HTML entities are already decoded in parseCQParams, so rawData is valid JSON
    const rawData = segment.data.data.trim();

    // Try to parse JSON for additional metadata
    let jsonData: JsonMessageData | undefined;
    try {
      jsonData = JSON.parse(rawData);
    } catch {
      // JSON parse failed, just use raw data
    }

    // Build result object - only include prompt if it exists and is non-empty
    const result: OpenClawJsonContent = {
      type: 'json',
      data: rawData,
    };

    // Only add prompt if it's a non-empty string
    if (jsonData?.prompt && jsonData.prompt.trim() !== '') {
      result.prompt = jsonData.prompt;
    }

    return result;
  } catch (error) {
    log.warn('adapters', `Failed to parse JSON message: ${error}`);
    return null;
  }
}

// =============================================================================
// File Handling Helpers
// =============================================================================

function formatFileSize(size: string | number): string {
  const num = typeof size === 'string' ? parseInt(size, 10) : size;
  if (isNaN(num)) return '';
  if (num < 1024) return `${num}B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)}KB`;
  return `${(num / (1024 * 1024)).toFixed(1)}MB`;
}

function formatFileInfo(segment: NapCatFileSegment): string {
  const fileName = segment.data.file || 'unknown';
  const fileSize = segment.data.file_size;
  const sizeText = fileSize ? ` (${formatFileSize(fileSize)})` : '';
  const url = (segment.data as any).url;
  const base64 = (segment.data as any).base64;

  let text = `[文件] ${fileName}${sizeText}`;

  if (url) {
    text += `\n下载链接: ${url}`;
  }

  // Add base64 content for small text files
  if (base64) {
    try {
      const decoded = atob(base64);
      if (decoded.length < 5000 && /^[\x20-\x7E\r\n\t]*$/.test(decoded)) {
        text += `\n文件内容:\n${decoded}`;
      }
    } catch {
      // Not valid base64, skip
    }
  }

  return text;
}

// =============================================================================
// NapCat -> OpenClaw Adapters (Inbound)
// =============================================================================

/**
 * Convert a single NapCat segment to OpenClaw format
 * Uses type assertions since segment.data is Record<string, unknown> in the union
 */
function napCatSegmentToOpenClaw(
  segment: NapCatMessageSegment,
): OpenClawMessageContent | null {
  const data = segment.data as Record<string, unknown>;

  switch (segment.type) {
    case 'text':
      return { type: 'text', text: String(data.text || '') };

    case 'at':
      return {
        type: 'at',
        userId: String(data.qq || ''),
        isAll: data.qq === 'all',
      };

    case 'image': {
      const url = extractImageUrl(data);
      return url
        ? { type: 'image', url, summary: data.summary as string | undefined }
        : { type: 'text', text: '[图片]' };
    }

    case 'reply':
      return { type: 'reply', messageId: String(data.id || '') };

    case 'face':
      return { type: 'text', text: getEmojiForFaceId(String(data.id || '')) };

    case 'poke':
      return { type: 'text', text: '[戳一戳]' };

    case 'record':
      return data.path
        ? {
          type: 'audio',
          path: String(data.path),
          file: String(data.file || ''),
          url: data.url as string | undefined,
          fileSize: data.file_size ? parseInt(String(data.file_size), 10) : undefined,
        }
        : { type: 'text', text: '[语音]' };

    case 'file':
      return { type: 'text', text: formatFileInfo(segment as NapCatFileSegment) };

    case 'json':
      return parseJsonSegment(segment as NapCatJsonSegment);

    case 'video':
      log.warn('adapters', `Unsupported message type (inbound): ${segment.type}`);
      return { type: 'text', text: `[${segment.type}消息]` };

    case 'xml':
      log.warn('adapters', `Unsupported message type (inbound): ${segment.type}`);
      return null;

    default:
      log.warn('adapters', `Unknown message type (inbound): ${segment.type}`);
      return null;
  }
}

// =============================================================================
// Async File Enrichment
// =============================================================================

interface GetFileData {
  file?: string;
  url?: string;
  file_size?: string;
  file_name?: string;
  base64?: string;
}

/**
 * Enrich file segments with actual file data from NapCat's get_file API
 */
async function enrichFileSegments(
  segments: NapCatMessageSegment[],
  connection?: ConnectionManager
): Promise<NapCatMessageSegment[]> {
  if (!connection) return segments;

  const enrichedSegments = [...segments];
  const fileIndices: number[] = [];

  for (let i = 0; i < enrichedSegments.length; i++) {
    if (enrichedSegments[i].type === 'file') {
      fileIndices.push(i);
    }
  }

  if (fileIndices.length === 0) return enrichedSegments;

  for (const index of fileIndices) {
    const segment = enrichedSegments[index] as NapCatFileSegment;
    const fileId = segment.data.file_id || segment.data.file;
    if (!fileId) continue;

    try {
      const response = await connection.sendRequest<GetFileData>('get_file', { file: fileId });
      if (response.status === 'ok' && response.data) {
        (segment.data as any).url = response.data.url;
        (segment.data as any).base64 = response.data.base64;
      }
    } catch (error) {
      log.warn('adapters', `Failed to fetch file data for ${fileId}: ${error}`);
    }
  }

  return enrichedSegments;
}

/**
 * Convert NapCat message segments to OpenClaw message content (async version)
 * Fetches file data using get_file API
 */
export async function napCatToOpenClawMessageAsync(
  segments: NapCatMessageSegment[] | string,
  connection?: ConnectionManager
): Promise<{ content: OpenClawMessageContent[]; isMention: boolean }> {
  const normalizedSegments = normalizeMessageSegments(segments);
  const enrichedSegments = await enrichFileSegments(normalizedSegments, connection);

  const content: OpenClawMessageContent[] = [];
  let isMention = false;

  for (const segment of enrichedSegments) {
    const result = napCatSegmentToOpenClaw(segment);
    if (result) {
      content.push(result);
    }
  }

  return { content, isMention };
}

// =============================================================================
// OpenClaw -> NapCat Adapters (Outbound)
// =============================================================================

/**
 * Convert a single OpenClaw content item to NapCat format
 */
function openClawSegmentToNapCat(
  content: OpenClawMessageContent
): NapCatMessageSegment | null {
  switch (content.type) {
    case 'text':
      return { type: 'text', data: { text: content.text } };

    case 'at':
      return { type: 'at', data: { qq: content.isAll ? 'all' : content.userId } };

    case 'image':
      return { type: 'image', data: { file: content.url, url: content.url } };

    case 'reply':
      return { type: 'reply', data: { id: content.messageId } };

    case 'audio':
      // These types are inbound-only for now
      log.warn('adapters', `Unsupported outbound type: ${content.type}`);
      return null;

    default:
      log.warn('adapters', `Unknown content type (outbound): ${(content as { type: string }).type}`);
      return null;
  }
}

/**
 * Convert OpenClaw message content to NapCat message segments
 */
export function openClawToNapCatMessage(
  content: OpenClawMessageContent[],
  replyToId?: string
): NapCatMessageSegment[] {
  const segments: NapCatMessageSegment[] = [];

  // Add reply segment at the start if replyToId is provided
  if (replyToId) {
    segments.push({ type: 'reply', data: { id: replyToId } });
  }

  for (const item of content) {
    const segment = openClawSegmentToNapCat(item);
    if (segment) {
      segments.push(segment);
    }
  }

  return segments;
}

// =============================================================================
// Text Extraction Utilities
// =============================================================================

/**
 * Extract plain text from message segments (for logging/debugging)
 * Directly processes NapCat segments to preserve more info (like @name)
 */
export function extractPlainTextFromSegments(segments: NapCatMessageSegment[]): string {
  return segments
    .map(seg => {
      const data = seg.data as Record<string, unknown>;
      switch (seg.type) {
        case 'text':
          return String(data.text || '');
        case 'at':
          return data.qq === 'all' ? '@全体成员' : `@${data.name || data.qq}`;
        case 'image':
          return '[图片]';
        case 'reply':
          return '[回复]';
        case 'face':
          return getEmojiForFaceId(String(data.id || ''));
        case 'poke':
          return '[戳一戳]';
        case 'file':
          return '[文件]';
        case 'record':
          return '[语音]';
        case 'json':
          return '[JSON]';
        default:
          return `[${seg.type}]`;
      }
    })
    .join('');
}

// =============================================================================
// Reply Message Parsing
// =============================================================================

/**
 * Check if segments contain a reply segment
 */
export function hasReplySegment(segments: NapCatMessageSegment[]): boolean {
  return segments.some(s => s.type === 'reply');
}

/**
 * Parse reply segments to get reply message ID and reply text
 */
export function parseReplySegments(segments: NapCatMessageSegment[]): {
  replyMessageId: string | null;
  replyText: string;
} {
  let replyMessageId: string | null = null;
  const textParts: string[] = [];

  for (const segment of segments) {
    if (segment.type === 'reply') {
      const data = segment.data as Record<string, unknown>;
      replyMessageId = String(data.id || '');
    } else {
      const data = segment.data as Record<string, unknown>;
      switch (segment.type) {
        case 'text':
          textParts.push(String(data.text || ''));
          break;
        case 'at':
          textParts.push(data.qq === 'all' ? '@全体成员' : `@${data.name || data.qq}`);
          break;
        case 'image':
          textParts.push('[图片]');
          break;
        case 'face':
          textParts.push(getEmojiForFaceId(String(data.id || '')));
          break;
        default:
          break;
      }
    }
  }

  return {
    replyMessageId,
    replyText: textParts.join(''),
  };
}

/**
 * Fetch quoted message using get_msg API
 */
async function fetchQuotedMessage(
  messageId: string,
  connection?: ConnectionManager
): Promise<GetMsgData | null> {
  if (!connection) return null;

  try {
    const response = await connection.sendRequest<GetMsgData>('get_msg', {
      message_id: Number(messageId),
    });

    if (response.status === 'ok' && response.data) {
      return response.data;
    }
  } catch (error) {
    log.warn('adapters', `Failed to fetch quoted message ${messageId}: ${error}`);
  }

  return null;
}

/**
 * Parsed reply message information
 */
interface ReplyMessageData {
  /** ID of the quoted message */
  replyMessageId: string;
  /** Nickname of the quoted message sender */
  quotedSenderNickname: string;
  /** Content of the quoted message */
  quotedMessage: string;
  /** Content of the reply text (after [CQ:reply]) */
  replyText: string;
}

/**
 * Result of parsing a reply message
 */
interface ReplyMessageParseResult {
  /** True if this is a reply message */
  isReply: boolean;
  /** Parsed reply data (if isReply is true) */
  data?: ReplyMessageData;
}

/**
 * Parse reply message and fetch quoted message content
 *
 * @param segments - Message segments (can be string or array)
 * @param connection - Optional NapCat connection for fetching quoted message
 * @returns ReplyMessageParseResult with parsed data
 */
export async function parseReplyMessage(
  segments: NapCatMessageSegment[] | string,
  connection?: ConnectionManager
): Promise<ReplyMessageParseResult> {
  const normalizedSegments = normalizeMessageSegments(segments);

  // Check if this is a reply message
  if (!hasReplySegment(normalizedSegments)) {
    return { isReply: false };
  }

  // Extract reply message ID and reply text
  const { replyMessageId, replyText } = parseReplySegments(normalizedSegments);

  if (!replyMessageId) {
    return { isReply: false };
  }

  // Fetch the quoted message
  const quotedMessage = await fetchQuotedMessage(replyMessageId, connection);

  if (!quotedMessage) {
    // If we can't fetch the quoted message, still return what we have
    return {
      isReply: true,
      data: {
        replyMessageId,
        quotedSenderNickname: '未知',
        quotedMessage: '[无法获取引用消息内容]',
        replyText,
      },
    };
  }

  // Extract quoted message content
  let quotedContent: string;
  if (typeof quotedMessage.message === 'string') {
    quotedContent = quotedMessage.message;
  } else if (Array.isArray(quotedMessage.message)) {
    quotedContent = extractPlainTextFromSegments(quotedMessage.message);
  } else {
    quotedContent = quotedMessage.raw_message || '';
  }

  return {
    isReply: true,
    data: {
      replyMessageId,
      quotedSenderNickname: quotedMessage.sender?.nickname || '未知',
      quotedMessage: quotedContent,
      replyText,
    },
  };
}
