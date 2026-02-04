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
  NapCatRecordSegment,
  NapCatJsonSegment,
  OpenClawMessageContent,
  OpenClawTextContent,
  OpenClawAtContent,
  OpenClawImageContent,
  OpenClawReplyContent,
  OpenClawAudioContent,
  OpenClawLocationContent,
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
    // Handle complex values like JSON data that contain commas
    const data: Record<string, string> = {};
    let pos = 0;

    while (pos < paramsStr.length) {
      // Skip leading commas
      if (paramsStr[pos] === ',') {
        pos++;
        continue;
      }

      // Match key (alphanumeric + underscore)
      const keyMatch = paramsStr.slice(pos).match(/^(\w+)=/);
      if (!keyMatch) break;

      const key = keyMatch[1];
      pos += keyMatch[0].length;

      // Extract value based on what follows
      let value = '';

      if (paramsStr[pos] === '{') {
        // JSON object value - find matching closing brace
        let depth = 1;
        let i = pos + 1;
        while (i < paramsStr.length && depth > 0) {
          if (paramsStr[i] === '{') depth++;
          if (paramsStr[i] === '}') depth--;
          i++;
        }
        value = paramsStr.slice(pos, i);
        pos = i;
      } else if (paramsStr[pos] === '[') {
        // JSON array value - find matching closing bracket
        let depth = 1;
        let i = pos + 1;
        while (i < paramsStr.length && depth > 0) {
          if (paramsStr[i] === '[') depth++;
          if (paramsStr[i] === ']') depth--;
          i++;
        }
        value = paramsStr.slice(pos, i);
        pos = i;
      } else {
        // Simple value - read until next comma or end
        const nextComma = paramsStr.indexOf(',', pos);
        if (nextComma === -1) {
          value = paramsStr.slice(pos);
          pos = paramsStr.length;
        } else {
          value = paramsStr.slice(pos, nextComma);
          pos = nextComma;
        }
      }

      // Decode HTML entities in values (e.g., &amp; -> &)
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
 * Connection interface for async operations
 */
export interface NapCatConnection {
  sendRequest: <T>(action: string, params?: Record<string, unknown>) => Promise<{
    status: string;
    msg?: string;
    data?: T;
  }>;
}

/**
 * Get file data from NapCat
 */
interface GetFileData {
  file?: string;
  url?: string;
  file_size?: string;
  file_name?: string;
  base64?: string;
}

/**
 * Enrich file segments with actual file data
 * This is an async operation that calls NapCat's get_file API
 */
export async function enrichFileSegments(
  segments: NapCatMessageSegment[],
  connection?: NapCatConnection
): Promise<NapCatMessageSegment[]> {
  const enrichedSegments = [...segments];
  const fileIndices: number[] = [];

  for (let i = 0; i < enrichedSegments.length; i++) {
    if (enrichedSegments[i].type === 'file') {
      fileIndices.push(i);
    }
  }

  if (fileIndices.length === 0 || !connection) {
    return enrichedSegments;
  }

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
 * This version can fetch file content using get_file API
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
      if (result.type === 'at') {
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
 * Type guard for record (audio) segment
 */
function isRecordSegment(segment: NapCatMessageSegment): segment is NapCatRecordSegment {
  return segment.type === 'record';
}

/**
 * Type guard for json segment
 */
function isJsonSegment(segment: NapCatMessageSegment): segment is NapCatJsonSegment {
  return segment.type === 'json';
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
      return isRecordSegment(segment) ? napCatRecordToOpenClaw(segment) : null;

    case 'video':
      // Unsupported types - log and skip
      logWarn('adapters', `Unsupported message type (inbound): ${segment.type}`);
      return {
        type: 'text',
        text: `[${segment.type}消息]`,
      };

    case 'xml':
    case 'json':
      return isJsonSegment(segment) ? napCatJsonToOpenClaw(segment) : null;

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
      summary: segment.data.summary,
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
  const url = (segment.data as any).url;
  const base64 = (segment.data as any).base64;

  // Build file info text
  let text = `[文件] ${fileName}${sizeText}`;

  // Add URL if available
  if (url) {
    text += `\n下载链接: ${url}`;
  }

  // Add base64 content for small text files
  if (base64) {
    // Decode base64 to check if it's text
    try {
      const decoded = atob(base64);
      // Check if it looks like text (ASCII only, reasonable size)
      if (decoded.length < 5000 && /^[\x20-\x7E\r\n\t]*$/.test(decoded)) {
        text += `\n文件内容:\n${decoded}`;
      }
    } catch {
      // Not valid base64, skip
    }
  }

  return {
    type: 'text',
    text,
  };
}

function napCatRecordToOpenClaw(segment: NapCatRecordSegment): OpenClawAudioContent | OpenClawTextContent {
  const path = segment.data.path;
  const file = segment.data.file;
  const url = segment.data.url;
  const fileSize = segment.data.file_size;

  if (path) {
    // Local file exists, use it
    return {
      type: 'audio',
      path,
      file,
      url,
      fileSize: fileSize ? parseInt(fileSize, 10) : undefined,
    };
  }

  // No local file path - return placeholder
  logWarn('adapters', 'Record segment without local path, using placeholder');
  return {
    type: 'text',
    text: '[语音]',
  };
}

/**
 * Parse JSON message data (for location shares, etc.)
 */
interface JsonMessageData {
  app?: string;
  prompt?: string;
  meta?: {
    'Location.Search'?: {
      address?: string;
      lat?: string;
      lng?: string;
      name?: string;
    };
  };
}

function napCatJsonToOpenClaw(segment: NapCatJsonSegment): OpenClawLocationContent | OpenClawTextContent | null {
  try {
    const jsonData: JsonMessageData = JSON.parse(segment.data.data);

    // Handle location share messages (com.tencent.map)
    if (jsonData.app === 'com.tencent.map' && jsonData.meta?.['Location.Search']) {
      const location = jsonData.meta['Location.Search'];
      return {
        type: 'location',
        text: jsonData.prompt || '[位置]',
        address: location.address,
        name: location.name,
        lat: location.lat,
        lng: location.lng,
      };
    }

    // For other JSON types, use the prompt if available
    if (jsonData.prompt) {
      return {
        type: 'text',
        text: jsonData.prompt,
      };
    }

    // Unknown JSON type - skip
    logWarn('adapters', `Unknown JSON message type: ${jsonData.app || 'unknown'}`);
    return null;
  } catch (error) {
    logWarn('adapters', `Failed to parse JSON message: ${error}`);
    return null;
  }
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
      case 'record':
        if (isRecordSegment(segment)) {
          const path = segment.data.path;
          const file = segment.data.file;
          parts.push(path ? `[语音](${path})` : `[语音](${file})`);
        } else {
          parts.push('[语音]');
        }
        break;
      case 'json':
        if (isJsonSegment(segment)) {
          try {
            const jsonData: JsonMessageData = JSON.parse(segment.data.data);
            if (jsonData.prompt) {
              parts.push(jsonData.prompt);
            } else {
              parts.push('[JSON消息]');
            }
          } catch {
            parts.push('[JSON消息]');
          }
        } else {
          parts.push('[JSON消息]');
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
