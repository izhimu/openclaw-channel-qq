/**
 * Message Type Adapters for NapCat <-> OpenClaw conversion
 */

import type {
  NapCatMessageSegment,
  NapCatTextSegment,
  NapCatAtSegment,
  NapCatImageSegment,
  NapCatReplySegment,
  NapCatFaceSegment,
  NapCatPokeSegment,
  NapCatFileSegment,
  OpenClawMessageContent,
  OpenClawTextContent,
  OpenClawAtContent,
  OpenClawImageContent,
  OpenClawReplyContent,
} from '../types/index.js';
import { logWarn, extractImageUrl, getEmojiForFaceId, getFaceIdForEmoji } from '../utils/index.js';

// =============================================================================
// NapCat -> OpenClaw Adapters (Inbound)
// =============================================================================

/**
 * CQ Code Parser
 * Parses CQ codes like [CQ:image,file=xxx,url=xxx] into segments
 */
function parseCQCode(text: string): NapCatMessageSegment[] {
  const segments: NapCatMessageSegment[] = [];

  // CQ code regex: [CQ:type,key=value,key2=value2,...]
  const cqRegex = /\[CQ:([a-zA-Z0-9_]+),([^\]]+)\]/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = cqRegex.exec(text)) !== null) {
    // Add text before this CQ code
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      if (textBefore) {
        segments.push({ type: 'text', data: { text: textBefore } });
      }
    }

    const type = match[1];
    const paramsStr = match[2];

    // Parse key=value pairs
    const data: Record<string, string> = {};
    const paramRegex = /(\w+)=([^,]+)/g;
    let paramMatch: RegExpExecArray | null;

    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      // Decode HTML entities in values (e.g., &amp; -> &)
      const key = paramMatch[1];
      let value = paramMatch[2];

      // Decode HTML entities
      value = value
        .replace(/&amp;/g, '&')
        .replace(/&#91;/g, '[')
        .replace(/&#93;/g, ']')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      data[key] = value;
    }

    // Create segment based on type
    segments.push({ type, data });

    lastIndex = cqRegex.lastIndex;
  }

  // Add remaining text after last CQ code
  if (lastIndex < text.length) {
    const textAfter = text.slice(lastIndex);
    if (textAfter) {
      segments.push({ type: 'text', data: { text: textAfter } });
    }
  }

  // If no CQ codes found, return the whole text as a single segment
  if (segments.length === 0) {
    return [{ type: 'text', data: { text } }];
  }

  return segments;
}

/**
 * Normalize message to segments array (handles string or array format)
 */
function normalizeMessageSegments(message: NapCatMessageSegment[] | string): NapCatMessageSegment[] {
  if (typeof message === 'string') {
    // Try to parse as CQ code string
    return parseCQCode(message);
  }
  if (!Array.isArray(message)) {
    logWarn('adapters', `Invalid message format: ${typeof message}`);
    return [{ type: 'text', data: { text: String(message) } }];
  }
  return message;
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
      if (result.type === 'at') {
        // Check if the bot is being mentioned
        if (botUserId && result.userId === String(botUserId)) {
          isMention = true;
        }
      }
    }
  }

  return { content, isMention };
}

/**
 * Type guard for text segment
 */
function isTextSegment(segment: NapCatMessageSegment): segment is NapCatTextSegment {
  return segment.type === 'text';
}

/**
 * Type guard for at segment
 */
function isAtSegment(segment: NapCatMessageSegment): segment is NapCatAtSegment {
  return segment.type === 'at';
}

/**
 * Type guard for image segment
 */
function isImageSegment(segment: NapCatMessageSegment): segment is NapCatImageSegment {
  return segment.type === 'image';
}

/**
 * Type guard for reply segment
 */
function isReplySegment(segment: NapCatMessageSegment): segment is NapCatReplySegment {
  return segment.type === 'reply';
}

/**
 * Type guard for face segment
 */
function isFaceSegment(segment: NapCatMessageSegment): segment is NapCatFaceSegment {
  return segment.type === 'face';
}

/**
 * Type guard for poke segment
 */
function isPokeSegment(segment: NapCatMessageSegment): segment is NapCatPokeSegment {
  return segment.type === 'poke';
}

/**
 * Type guard for file segment
 */
function isFileSegment(segment: NapCatMessageSegment): segment is NapCatFileSegment {
  return segment.type === 'file';
}

/**
 * Convert a single NapCat segment to OpenClaw format
 */
function napCatSegmentToOpenClaw(
  segment: NapCatMessageSegment,
  botUserId?: number
): OpenClawMessageContent | null {
  switch (segment.type) {
    case 'text':
      return isTextSegment(segment) ? napCatTextToOpenClaw(segment) : null;

    case 'at':
      return isAtSegment(segment) ? napCatAtToOpenClaw(segment) : null;

    case 'image':
      return isImageSegment(segment) ? napCatImageToOpenClaw(segment) : null;

    case 'reply':
      return isReplySegment(segment) ? napCatReplyToOpenClaw(segment) : null;

    case 'face':
      return isFaceSegment(segment) ? napCatFaceToOpenClaw(segment) : null;

    case 'poke':
      return isPokeSegment(segment) ? napCatPokeToOpenClaw(segment) : null;

    case 'file':
      return isFileSegment(segment) ? napCatFileToOpenClaw(segment) : null;

    case 'record':
    case 'video':
      // Unsupported types - log and skip
      logWarn('adapters', `Unsupported message type (inbound): ${segment.type}`);
      return {
        type: 'text',
        text: `[${segment.type}消息]`,
      };

    case 'xml':
    case 'json':
      // XML/JSON messages - skip or show as placeholder
      logWarn('adapters', `Skipping ${segment.type} message`);
      return null;

    default:
      logWarn('adapters', `Unknown message type (inbound): ${segment.type}`);
      return null;
  }
}

function napCatTextToOpenClaw(segment: NapCatTextSegment): OpenClawTextContent {
  return {
    type: 'text',
    text: segment.data.text,
  };
}

function napCatAtToOpenClaw(segment: NapCatAtSegment): OpenClawAtContent {
  const qq = segment.data.qq;

  if (qq === 'all') {
    return {
      type: 'at',
      userId: 'all',
      isAll: true,
    };
  }

  return {
    type: 'at',
    userId: qq,
    isAll: false,
  };
}

function napCatImageToOpenClaw(segment: NapCatImageSegment): OpenClawImageContent | OpenClawTextContent | null {
  const url = extractImageUrl(segment.data);

  if (url) {
    return {
      type: 'image',
      url,
    };
  }

  // Local image without URL - return placeholder
  logWarn('adapters', 'Image segment without URL, using placeholder');
  return {
    type: 'text',
    text: '[图片]',
  };
}

function napCatReplyToOpenClaw(segment: NapCatReplySegment): OpenClawReplyContent {
  return {
    type: 'reply',
    messageId: segment.data.id,
  };
}

function napCatFaceToOpenClaw(segment: NapCatFaceSegment): OpenClawTextContent {
  const emoji = getEmojiForFaceId(segment.data.id);
  return {
    type: 'text',
    text: emoji,
  };
}

function napCatPokeToOpenClaw(_segment: NapCatPokeSegment): OpenClawTextContent {
  return {
    type: 'text',
    text: '[戳一戳]',
  };
}

function napCatFileToOpenClaw(segment: NapCatFileSegment): OpenClawTextContent {
  const fileName = segment.data.file || 'unknown';
  const fileSize = segment.data.file_size;
  const sizeText = fileSize ? ` (${formatFileSize(fileSize)})` : '';
  return {
    type: 'text',
    text: `[文件] ${fileName}${sizeText}`,
  };
}

function formatFileSize(size: string | number): string {
  const num = typeof size === 'string' ? parseInt(size, 10) : size;
  if (isNaN(num)) return '';
  if (num < 1024) return `${num}B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)}KB`;
  return `${(num / (1024 * 1024)).toFixed(1)}MB`;
}

// =============================================================================
// OpenClaw -> NapCat Adapters (Outbound)
// =============================================================================

/**
 * Convert OpenClaw message content to NapCat message segments
 * @param content - OpenClaw message content array
 * @param replyToId - Optional message ID to reply to
 */
export function openClawToNapCatMessage(
  content: OpenClawMessageContent[],
  replyToId?: string
): NapCatMessageSegment[] {
  const segments: NapCatMessageSegment[] = [];

  // Add reply segment at the start if replyToId is provided
  if (replyToId) {
    segments.push({
      type: 'reply',
      data: {
        id: replyToId,
      },
    });
  }

  for (const item of content) {
    const segment = openClawSegmentToNapCat(item);
    if (segment) {
      segments.push(segment);
    }
  }

  return segments;
}

/**
 * Convert a single OpenClaw content item to NapCat format
 */
function openClawSegmentToNapCat(
  content: OpenClawMessageContent
): NapCatMessageSegment | null {
  switch (content.type) {
    case 'text':
      return openClawTextToNapCat(content);

    case 'at':
      return openClawAtToNapCat(content);

    case 'image':
      return openClawImageToNapCat(content);

    case 'reply':
      return openClawReplyToNapCat(content);

    default:
      logWarn('adapters', `Unknown content type (outbound): ${(content as { type: string }).type}`);
      return null;
  }
}

function openClawTextToNapCat(content: OpenClawTextContent): NapCatTextSegment {
  return {
    type: 'text',
    data: {
      text: content.text,
    },
  };
}

function openClawAtToNapCat(content: OpenClawAtContent): NapCatAtSegment {
  if (content.isAll) {
    return {
      type: 'at',
      data: {
        qq: 'all',
      },
    };
  }

  return {
    type: 'at',
    data: {
      qq: content.userId,
    },
  };
}

function openClawImageToNapCat(content: OpenClawImageContent): NapCatImageSegment {
  return {
    type: 'image',
    data: {
      file: content.url,
      url: content.url,
    },
  };
}

function openClawReplyToNapCat(content: OpenClawReplyContent): NapCatReplySegment {
  return {
    type: 'reply',
    data: {
      id: content.messageId,
    },
  };
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
  const poke = segments.find(s => s.type === 'poke') as NapCatPokeSegment | undefined;
  if (!poke) {
    return null;
  }

  return {
    type: 'poke',
    senderId,
    targetId: poke.data.qq || 'unknown',
    groupId,
  };
}

/**
 * Extract plain text from message segments (for logging/debugging)
 */
export function extractPlainTextFromSegments(segments: NapCatMessageSegment[]): string {
  const parts: string[] = [];

  for (const segment of segments) {
    switch (segment.type) {
      case 'text':
        if (isTextSegment(segment)) {
          parts.push(segment.data.text);
        }
        break;
      case 'at':
        if (isAtSegment(segment)) {
          const qq = segment.data.qq;
          parts.push(qq === 'all' ? '@全体成员' : `@${segment.data.name || qq}`);
        }
        break;
      case 'image':
        // Include URL for debugging, so images can be accessed
        if (isImageSegment(segment)) {
          const url = segment.data.url || segment.data.file;
          parts.push(url ? `[图片](${url})` : '[图片]');
        } else {
          parts.push('[图片]');
        }
        break;
      case 'reply':
        parts.push('[回复]');
        break;
      case 'face':
        if (isFaceSegment(segment)) {
          parts.push(getEmojiForFaceId(segment.data.id));
        }
        break;
      case 'poke':
        parts.push('[戳一戳]');
        break;
      case 'file':
        if (isFileSegment(segment)) {
          const fileName = segment.data.file || 'unknown';
          const fileSize = segment.data.file_size;
          const sizeText = fileSize ? ` (${formatFileSize(fileSize)})` : '';
          parts.push(`[文件] ${fileName}${sizeText}`);
        } else {
          parts.push('[文件]');
        }
        break;
      default:
        parts.push(`[${segment.type}]`);
    }
  }

  return parts.join('');
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
// Message Content Building Helpers
// =============================================================================

/**
 * Create a text message content
 */
export function createTextContent(text: string): OpenClawTextContent {
  return {
    type: 'text',
    text,
  };
}

/**
 * Create an at-mention message content
 */
export function createAtContent(userId: string, isAll = false): OpenClawAtContent {
  return {
    type: 'at',
    userId,
    isAll,
  };
}

/**
 * Create an image message content
 */
export function createImageContent(url: string): OpenClawImageContent {
  return {
    type: 'image',
    url,
  };
}

/**
 * Create a reply message content
 */
export function createReplyContent(messageId: string): OpenClawReplyContent {
  return {
    type: 'reply',
    messageId,
  };
}

// =============================================================================
// Emoji/Face Handling
// =============================================================================

/**
 * Try to convert emoji to QQ face, otherwise return as text
 */
export function convertEmojiOrText(emoji: string): string | NapCatFaceSegment {
  const faceId = getFaceIdForEmoji(emoji);
  if (faceId) {
    return {
      type: 'face',
      data: {
        id: faceId,
      },
    };
  }
  return emoji;
}

/**
 * Check if content represents an @all mention
 */
export function isAtAll(content: OpenClawAtContent): boolean {
  return content.isAll === true || content.userId === 'all';
}

/**
 * Check if any content in an array contains @all
 */
export function containsAtAll(contents: OpenClawMessageContent[]): boolean {
  return contents.some(
    c => c.type === 'at' && isAtAll(c as OpenClawAtContent)
  );
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
 * @param messageId - The message ID to recall
 * @param connection - Connection to use for the request
 * @returns Recall result
 */
export async function recallMessage(
  messageId: string | number,
  connection: {
    sendRequest: <T>(action: string, params?: Record<string, unknown>) => Promise<{ status: string; msg?: string; data?: T }>;
  }
): Promise<RecallResult> {
  try {
    const response = await connection.sendRequest('delete_msg', {
      message_id: Number(messageId),
    });

    if (response.status === 'ok') {
      return { success: true };
    } else {
      // Parse error message to determine the type of failure
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

      return {
        success: false,
        error: errorMsg,
        code: 'RECALL_FAILED',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('timeout')) {
      return {
        success: false,
        error: 'Request timeout - message may be too old to recall',
        code: 'RECALL_TIMEOUT',
      };
    }

    return {
      success: false,
      error: errorMessage,
      code: 'RECALL_ERROR',
    };
  }
}
