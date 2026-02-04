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
  GetMsgResponse,
  ReplyMessageData,
  ReplyMessageParseResult,
} from '../types/index.js';
import { logWarn, extractImageUrl, getEmojiForFaceId } from '../utils/index.js';
import { CQCodeUtils, type CQNode } from '../utils/cqcode.js';

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
    logWarn('adapters', `Invalid message format: ${typeof message}`);
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
    if (jsonData?.prompt && typeof jsonData.prompt === 'string' && jsonData.prompt.trim() !== '') {
      result.prompt = jsonData.prompt;
    }

    return result;
  } catch (error) {
    logWarn('adapters', `Failed to parse JSON message: ${error}`);
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
  botUserId?: number
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
      logWarn('adapters', `Unsupported message type (inbound): ${segment.type}`);
      return { type: 'text', text: `[${segment.type}消息]` };

    case 'xml':
      logWarn('adapters', `Unsupported message type (inbound): ${segment.type}`);
      return null;

    default:
      logWarn('adapters', `Unknown message type (inbound): ${segment.type}`);
      return null;
  }
}

/**
 * Convert NapCat message segments to OpenClaw message content
 */
export function napCatToOpenClawMessage(
  segments: NapCatMessageSegment[] | string,
  botUserId?: number
): { content: OpenClawMessageContent[]; isMention: boolean } {
  const content: OpenClawMessageContent[] = [];
  let isMention = false;

  const normalizedSegments = normalizeMessageSegments(segments);

  for (const segment of normalizedSegments) {
    const result = napCatSegmentToOpenClaw(segment, botUserId);
    if (result) {
      content.push(result);
      if (result.type === 'at' && botUserId && result.userId === String(botUserId)) {
        isMention = true;
      }
    }
  }

  return { content, isMention };
}

// =============================================================================
// Async File Enrichment
// =============================================================================

/**
 * Connection interface for async operations
 */
export interface NapCatConnection {
  sendRequest: <T>(action: string, params?: Record<string, unknown>) => Promise<{
    status: string;
    msg?: string;
    data?: T;
  }>;
}

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
  connection?: NapCatConnection
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
      logWarn('adapters', `Failed to fetch file data for ${fileId}: ${error}`);
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
  botUserId?: number,
  connection?: NapCatConnection
): Promise<{ content: OpenClawMessageContent[]; isMention: boolean }> {
  const normalizedSegments = normalizeMessageSegments(segments);
  const enrichedSegments = await enrichFileSegments(normalizedSegments, connection);

  const content: OpenClawMessageContent[] = [];
  let isMention = false;

  for (const segment of enrichedSegments) {
    const result = napCatSegmentToOpenClaw(segment, botUserId);
    if (result) {
      content.push(result);
      if (result.type === 'at' && botUserId && result.userId === String(botUserId)) {
        isMention = true;
      }
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
      logWarn('adapters', `Unsupported outbound type: ${content.type}`);
      return null;

    default:
      logWarn('adapters', `Unknown content type (outbound): ${(content as { type: string }).type}`);
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

/**
 * Check if a message contains only text (no special formatting)
 */
export function isPlainTextMessage(segments: NapCatMessageSegment[]): boolean {
  return segments.length === 1 && segments[0].type === 'text';
}

/**
 * Get message summary for logging
 */
export function getMessageSummary(segments: NapCatMessageSegment[], maxLength = 50): string {
  const text = extractPlainTextFromSegments(segments);
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

// =============================================================================
// Content Creation Helpers
// =============================================================================

/**
 * Create a text message content
 */
export function createTextContent(text: string): { type: 'text'; text: string } {
  return { type: 'text', text };
}

/**
 * Create an at-mention message content
 */
export function createAtContent(
  userId: string,
  isAll = false
): { type: 'at'; userId: string; isAll: boolean } {
  return { type: 'at', userId, isAll };
}

/**
 * Create an image message content
 */
export function createImageContent(url: string): { type: 'image'; url: string } {
  return { type: 'image', url };
}

/**
 * Create a reply message content
 */
export function createReplyContent(messageId: string): { type: 'reply'; messageId: string } {
  return { type: 'reply', messageId };
}

// =============================================================================
// Special Message Type Handling
// =============================================================================

/**
 * Handle poke/nudge events
 */
export interface PokeMessage {
  type: 'poke';
  senderId: string;
  targetId: string;
  groupId?: string;
}

export function isPokeEvent(segments: NapCatMessageSegment[]): boolean {
  return segments.some(s => s.type === 'poke');
}

export function parsePokeMessage(
  segments: NapCatMessageSegment[],
  senderId: string,
  groupId?: string
): PokeMessage | null {
  const poke = segments.find(s => s.type === 'poke');
  if (!poke || poke.type !== 'poke') return null;

  const data = poke.data as Record<string, unknown>;
  return {
    type: 'poke',
    senderId,
    targetId: String(data.qq || 'unknown'),
    groupId,
  };
}

// =============================================================================
// Message Recall (delete_msg)
// =============================================================================

/**
 * Result of a recall operation
 */
export interface RecallResult {
  success: boolean;
  error?: string;
  code?: string;
}

/**
 * Recall (delete) a message
 * Note: Messages can only be recalled within 2 minutes on QQ
 */
export async function recallMessage(
  messageId: string | number,
  connection: {
    sendRequest: (action: string, params?: Record<string, unknown>) => Promise<{
      status: string;
      msg?: string;
      data?: unknown;
    }>;
  }
): Promise<RecallResult> {
  try {
    const response = await connection.sendRequest('delete_msg', {
      message_id: Number(messageId),
    });

    if (response.status === 'ok') {
      return { success: true };
    }

    const errorMsg = response.msg || 'Unknown error';

    if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
      return {
        success: false,
        error: 'Message recall timeout - message may be too old to recall',
        code: 'RECALL_TIMEOUT',
      };
    }

    if (errorMsg.includes('permission') || errorMsg.includes('权限')) {
      return {
        success: false,
        error: 'Permission denied - cannot recall this message',
        code: 'PERMISSION_DENIED',
      };
    }

    if (errorMsg.includes('not found') || errorMsg.includes('不存在')) {
      return {
        success: false,
        error: 'Message not found or already recalled',
        code: 'MESSAGE_NOT_FOUND',
      };
    }

    return { success: false, error: errorMsg, code: 'RECALL_FAILED' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('timeout')) {
      return {
        success: false,
        error: 'Request timeout - message may be too old to recall',
        code: 'RECALL_TIMEOUT',
      };
    }

    return { success: false, error: errorMessage, code: 'RECALL_ERROR' };
  }
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
 * Extract reply message ID from segments
 */
export function extractReplyMessageId(segments: NapCatMessageSegment[]): string | null {
  for (const segment of segments) {
    if (segment.type === 'reply') {
      const data = segment.data as Record<string, unknown>;
      return String(data.id || '');
    }
  }
  return null;
}

/**
 * Extract text content from segments (excluding reply segments)
 */
export function extractTextExcludingReply(segments: NapCatMessageSegment[]): string {
  return segments
    .filter(s => s.type !== 'reply')
    .map(seg => {
      const data = seg.data as Record<string, unknown>;
      switch (seg.type) {
        case 'text':
          return String(data.text || '');
        case 'at':
          return data.qq === 'all' ? '@全体成员' : `@${data.name || data.qq}`;
        case 'image':
          return '[图片]';
        case 'face':
          return getEmojiForFaceId(String(data.id || ''));
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
  connection?: NapCatConnection
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
    logWarn('adapters', `Failed to fetch quoted message ${messageId}: ${error}`);
  }

  return null;
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
  connection?: NapCatConnection
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
  let quotedContent = '';
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

/**
 * Format reply message as markdown
 *
 * Output format:
 * ```markdown
 * [回复]
 *
 * ## 引用消息
 *
 * ${sender.nickname}: ${message}
 *
 * ## 回复消息
 *
 * ${replyText}
 * ```
 *
 * @param data - ReplyMessageData to format
 * @returns Formatted markdown string
 */
export function formatReplyAsMarkdown(data: ReplyMessageData): string {
  const { quotedSenderNickname, quotedMessage, replyText } = data;

  return `[回复]

## 引用消息

${quotedSenderNickname}: ${quotedMessage}

## 回复消息

${replyText}`;
}

/**
 * Parse and format reply message in one step
 *
 * @param segments - Message segments (can be string or array)
 * @param connection - Optional NapCat connection for fetching quoted message
 * @returns Formatted markdown string or null if not a reply message
 */
export async function parseAndFormatReply(
  segments: NapCatMessageSegment[] | string,
  connection?: NapCatConnection
): Promise<string | null> {
  const result = await parseReplyMessage(segments, connection);

  if (!result.isReply || !result.data) {
    return null;
  }

  return formatReplyAsMarkdown(result.data);
}
