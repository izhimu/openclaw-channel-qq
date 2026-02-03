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
  OpenClawMessageContent,
  OpenClawTextContent,
  OpenClawAtContent,
  OpenClawImageContent,
  OpenClawReplyContent,
} from './types.js';
import { logWarn, extractImageUrl, getEmojiForFaceId, getFaceIdForEmoji } from './utils.js';

// =============================================================================
// NapCat -> OpenClaw Adapters (Inbound)
// =============================================================================

/**
 * Convert NapCat message segments to OpenClaw message content
 */
export function napCatToOpenClawMessage(
  segments: NapCatMessageSegment[],
  botUserId?: number
): { content: OpenClawMessageContent[]; isMention: boolean } {
  const content: OpenClawMessageContent[] = [];
  let isMention = false;

  for (const segment of segments) {
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

function napCatPokeToOpenClaw(segment: NapCatPokeSegment): OpenClawTextContent {
  return {
    type: 'text',
    text: '[戳一戳]',
  };
}

// =============================================================================
// OpenClaw -> NapCat Adapters (Outbound)
// =============================================================================

/**
 * Convert OpenClaw message content to NapCat message segments
 */
export function openClawToNapCatMessage(
  content: OpenClawMessageContent[]
): NapCatMessageSegment[] {
  const segments: NapCatMessageSegment[] = [];

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
        parts.push('[图片]');
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
