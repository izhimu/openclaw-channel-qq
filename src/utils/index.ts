/**
 * Utility functions for QQ NapCat plugin
 */

import { randomUUID } from 'crypto';
import type { OpenClawMessage } from '../types';

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique message ID for OpenClaw
 * Uses UUID for thread-safe and collision-free ID generation
 */
export function generateMessageId(): string {
  return `qq-${randomUUID()}`;
}

/**
 * Generate a unique echo ID for request correlation
 * Uses UUID for thread-safe and collision-free ID generation
 */
export function generateEchoId(): string {
  return `echo-${randomUUID()}`;
}

// =============================================================================
// Message ID Conversion
// =============================================================================

/**
 * Convert NapCat integer message ID to string
 */
export function messageIdToString(messageId: number | string): string {
  return String(messageId);
}

// =============================================================================
// Face/Emoji Mapping
// =============================================================================

/**
 * Map common QQ face IDs to emoji
 */
export const
  FACE_ID_TO_EMOJI: Record<string, string> = {
    '0': '😊',
    '1': '😅',
    '2': '☺️',
    '3': '😄',
    '4': '😁',
    '5': '😆',
    '6': '😃',
    '7': '😂',
    '8': '🤣',
    '9': '😊',
    '10': '😍',
    '11': '🥰',
    '12': '😘',
    '13': '😗',
    '14': '😙',
    '15': '😚',
    '16': '🥲',
    '17': '🙂',
    '18': '🙃',
    '19': '😉',
    '20': '😌',
    '21': '😍',
    '22': '🥰',
    '23': '😘',
    '24': '😗',
    '25': '😙',
    '26': '😚',
    '27': '😋',
    '28': '😛',
    '29': '😝',
    '30': '😜',
    '31': '🤪',
    '32': '🤨',
    '33': '🧐',
    '34': '🤓',
    '35': '😎',
    '36': '🤩',
    '37': '🥳',
    '38': '😏',
    '39': '😒',
    '40': '😞',
    '41': '😔',
    '42': '😟',
    '43': '😕',
    '44': '🙁',
    '45': '😣',
    '46': '😖',
    '47': '😫',
    '48': '😩',
    '49': '🥺',
    '50': '😢',
    '51': '😭',
    '52': '😤',
    '53': '😠',
    '54': '😡',
    '55': '🤬',
    '56': '🤯',
    '57': '😳',
    '58': '🥵',
    '59': '🥶',
    '60': '😱',
    '61': '😨',
    '62': '😰',
    '63': '😥',
    '64': '😓',
    '65': '🤗',
    '66': '🤔',
    '67': '🤭',
    '68': '🤫',
    '69': '🤥',
    '70': '😶',
    '71': '😐',
    '72': '😑',
    '73': '😬',
    '74': '🙄',
    '75': '😯',
    '76': '😦',
    '77': '😧',
    '78': '😮',
    '79': '😲',
    '80': '🥱',
    '81': '😴',
    '82': '🤤',
    '83': '😪',
    '84': '😵',
    '85': '🤐',
    '86': '🥴',
    '87': '🤢',
    '88': '🤮',
    '89': '🤧',
    '90': '😷',
    '91': '🤒',
    '92': '🤕',
    '93': '🤑',
    '94': '🤠',
    '95': '😈',
    '96': '👿',
    '97': '👹',
    '98': '👺',
    '99': '🤡',
    '100': '💩',
    '101': '👻',
    '102': '💀',
    '103': '☠️',
    '104': '👽',
    '105': '👾',
    '106': '🤖',
    '107': '🎃',
    '108': '😺',
    '109': '😸',
    '110': '😹',
    '111': '😻',
    '112': '😼',
    '113': '😽',
    '114': '🙀',
    '115': '😿',
    '116': '😾',
  };

/**
 * Get emoji for QQ face ID
 * For unknown IDs, shows the ID for reference
 */
export function getEmojiForFaceId(faceId: string): string {
  return FACE_ID_TO_EMOJI[faceId] || `[表情:${faceId}]`;
}

// =============================================================================
// URL Validation
// =============================================================================

/**
 * Check if a string is a valid URL
 */
export function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract URL from image data
 * Returns the URL if valid, otherwise returns undefined
 */
export function extractImageUrl(data: { url?: string; file?: string }): string | undefined {
  if (data.url && isValidUrl(data.url)) {
    return data.url;
  }
  if (data.file && isValidUrl(data.file)) {
    return data.file;
  }
  return undefined;
}

// =============================================================================
// Delay Helpers
// =============================================================================

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(attempt: number, baseMs: number = 1000, maxMs: number = 30000): number {
  const delay = baseMs * Math.pow(2, attempt);
  return Math.min(delay, maxMs);
}

// =============================================================================
// Array Helpers
// =============================================================================

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// =============================================================================
// WebSocket Helpers
// =============================================================================

/**
 * Get a human-readable message for a WebSocket close code
 */
export function getCloseCodeMessage(code: number): string {
  const messages: Record<number, string> = {
    1000: 'Normal closure',
    1001: 'Going away',
    1002: 'Protocol error',
    1003: 'Unsupported data',
    1004: 'Reserved',
    1005: 'No status received',
    1006: 'Abnormal closure',
    1007: 'Invalid frame payload data',
    1008: 'Policy violation',
    1009: 'Message too big',
    1010: 'Missing extension',
    1011: 'Internal error',
    1012: 'Service restart',
    1013: 'Try again later',
    1014: 'Bad gateway',
    1015: 'TLS handshake',
  };
  return messages[code] ?? `Unknown close code: ${code}`;
}

export type FileCategory = 'image' | 'audio' | 'file';

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'bmp',
  'webp', 'svg', 'tiff', 'ico', 'heic'
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3',   // 最通用
  'wav',   // 无损/未压缩
  'ogg',   // 开源/Web常用
  'm4a',   // Apple/MPEG-4 音频
  'aac',   // 高级音频编码
  'flac',  // 无损压缩
  'wma',   // Windows Media
  'aiff',  // Apple Interchange
  'amr',   // 移动端录音
  'opus'   // 现代Web流媒体
]);

export function getFileType(pathOrUrl: string): FileCategory {
  if (!pathOrUrl) return 'file';

  try {
    const cleanPath = pathOrUrl.split(/[?#]/)[0];

    const lastDotIndex = cleanPath.lastIndexOf('.');

    if (lastDotIndex === -1) {
      return 'file';
    }

    const extension = cleanPath.substring(lastDotIndex + 1).toLowerCase();

    if (IMAGE_EXTENSIONS.has(extension)) {
      return 'image';
    }

    if (AUDIO_EXTENSIONS.has(extension)) {
      return 'audio';
    }

    return 'file';
  } catch (error) {
    return 'file';
  }
}

export function getFileName(pathOrUrl: string): string {
  if (!pathOrUrl) return '';

  try {
    let cleanPath = pathOrUrl.split(/[?#]/)[0];

    try {
      cleanPath = decodeURIComponent(cleanPath);
    } catch (e) {
    }

    cleanPath = cleanPath.replace(/\\/g, '/');

    if (cleanPath.endsWith('/')) {
      cleanPath = cleanPath.slice(0, -1);
    }

    const fileName = cleanPath.split('/').pop();

    return fileName || '';
  } catch (error) {
    return '';
  }
}

// =============================================================================
// Media Message Builder
// =============================================================================

/**
 * Build an OpenClawMessage from a media URL
 * Automatically detects file type (image, audio, or file)
 */
export function buildMediaMessage(mediaUrl: string): OpenClawMessage {
  const trimmedUrl = mediaUrl.trim();

  switch (getFileType(trimmedUrl)) {
    case "image":
      return { type: "image", url: trimmedUrl };
    case "audio":
      return {
        type: "audio",
        path: trimmedUrl,
        url: trimmedUrl,
        file: getFileName(trimmedUrl)
      };
    default:
      return {
        type: "file",
        url: trimmedUrl,
        file: getFileName(trimmedUrl)
      };
  }
}

// =============================================================================
// CQ Code Utilities
// =============================================================================

export {
  CQCodeUtils,
  CQNode
} from './cqcode.js';

// =============================================================================
// Log Utilities
// =============================================================================

export {
  Logger
} from './log.js';

// =============================================================================
// Markdown Utilities
// =============================================================================

export {
  MarkdownToText,
  markdownToText,
} from './markdown.js'