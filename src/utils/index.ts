/**
 * Utility functions for QQ NapCat plugin
 */

import type {
  NapCatMessageSegment,
  OpenClawMessageContent,
  NapCatTextSegment,
  NapCatAtSegment,
  NapCatImageSegment,
  NapCatReplySegment,
  NapCatFaceSegment,
} from '../types/index.js';

// =============================================================================
// ID Generation
// =============================================================================

let idCounter = 0;
const ID_PREFIX = 'qq-';

/**
 * Generate a unique message ID for OpenClaw
 */
export function generateMessageId(): string {
  return `${ID_PREFIX}${Date.now()}-${++idCounter}`;
}

/**
 * Generate a unique echo ID for request correlation
 */
export function generateEchoId(): string {
  return `echo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
// Logger
// =============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

export function logDebug(category: string, message: string, ...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.DEBUG) {
    console.debug(`[openclaw-channel-qq:${category}] ${message}`, ...args);
  }
}

export function logInfo(category: string, message: string, ...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.INFO) {
    console.info(`[openclaw-channel-qq:${category}] ${message}`, ...args);
  }
}

export function logWarn(category: string, message: string, ...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.WARN) {
    console.warn(`[openclaw-channel-qq:${category}] ${message}`, ...args);
  }
}

export function logError(category: string, message: string, ...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.ERROR) {
    console.error(`[openclaw-channel-qq:${category}] ${message}`, ...args);
  }
}

// =============================================================================
// Face/Emoji Mapping
// =============================================================================

/**
 * Map common QQ face IDs to emoji
 */
export const FACE_ID_TO_EMOJI: Record<string, string> = {
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
 * Create a promise that resolves after a specified delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(attempt: number, baseMs: number = 1000, maxMs: number = 30000): number {
  const delay = baseMs * Math.pow(2, attempt);
  return Math.min(delay, maxMs);
}

// =============================================================================
// Safe JSON Parsing
// =============================================================================

/**
 * Safely parse JSON with a fallback value
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely stringify JSON, handling circular references
 */
export function safeJsonStringify(obj: unknown, pretty: boolean = false): string {
  try {
    return JSON.stringify(obj, null, pretty ? 2 : undefined);
  } catch (e) {
    return String(obj);
  }
}

// =============================================================================
// Array Helpers
// =============================================================================

/**
 * Group an array by a key function
 */
export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    (result[key] ??= []).push(item);
    return result;
  }, {} as Record<K, T[]>);
}

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
// Deep Clone
// =============================================================================

/**
 * Create a deep clone of an object using structured clone
 * Falls back to JSON parse/stringify if structured clone fails
 */
export function deepClone<T>(obj: T): T {
  try {
    return structuredClone(obj);
  } catch {
    return safeJsonParse(safeJsonStringify(obj), obj);
  }
}

// =============================================================================
// Connection State Helpers
// =============================================================================

/**
 * Check if a connection state is considered "active"
 */
export function isActiveConnectionState(state: string): boolean {
  return state === 'connected' || state === 'connecting';
}

/**
 * Check if a connection state is terminal (cannot recover)
 */
export function isTerminalConnectionState(state: string): boolean {
  return state === 'failed';
}

// =============================================================================
// WebSocket Helpers
// =============================================================================

/**
 * Check if a WebSocket close code is considered "normal"
 */
export function isNormalCloseCode(code: number): boolean {
  return code === 1000 || code === 1001;
}

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

// =============================================================================
// CQ Code Utilities
// =============================================================================

export { CQCodeUtils, CQNode } from './cqcode.js';
