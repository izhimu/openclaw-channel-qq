/**
 * Message Type Adapters for NapCat <-> OpenClaw conversion
 *
 * Optimized for maintainability with clear structure and minimal duplication.
 */

import type {
  NapCatMessage,
  NapCatJsonSegment,
  OpenClawMessage,
  OpenClawJsonContent,
} from '../types';
import { Logger as log, extractImageUrl, getEmojiForFaceId } from '../utils/index.js';
import { CQCodeUtils, type CQNode } from '../utils';
import { getMsg } from "../core/request.js";

// =============================================================================
// CQ Code Parsing
// =============================================================================

/**
 * Convert CQNode to NapCatMessageSegment
 */
function cqNodeToNapCat(node: CQNode): NapCatMessage {
  return {
    type: node.type,
    data: node.data,
  };
}

/**
 * Parse CQ codes using CQCodeUtils and convert to NapCatMessageSegment[]
 */
function parseCQCode(text: string): NapCatMessage[] {
  const nodes = CQCodeUtils.parse(text);
  return nodes.map(cqNodeToNapCat);
}

/**
 * Normalize message to segments array (handles string or array format)
 */
function normalizeMessage(message: NapCatMessage[] | string): NapCatMessage[] {
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

function parseJsonSegment(segment: NapCatJsonSegment): OpenClawJsonContent | OpenClawMessage | null {
  try {
    const rawData = segment.data.data.trim();
    let jsonData: JsonMessageData | undefined;
    try {
      jsonData = JSON.parse(rawData);
    } catch (error) {
      log.warn('adapters', `Failed to parse JSON message: ${error}`);
    }

    const result: OpenClawJsonContent = {
      type: 'json',
      data: rawData,
    };

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
// NapCat -> OpenClaw Adapters (Inbound)
// =============================================================================

async function napCatToOpenClaw(segment: NapCatMessage): Promise<OpenClawMessage | null> {
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
      return url ? { type: 'image', url, summary: data.summary as string | undefined } : null;
    }

    case 'reply':
      const response = await getMsg({
        message_id: Number(data.id),
      });
      if (response.data?.message == undefined) {
        return null;
      }
      return {
        type: 'reply',
        messageId: String(data.id),
        message: response.data.raw_message,
        senderId: String(response.data.sender.user_id),
        sender: response.data.sender.nickname
      };

    case 'video':
      return {
        type: 'video',
        url: String(data.url || ''),
        fileSize: data.file_size ? parseInt(String(data.file_size), 10) : undefined,
      };

    case 'face':
      return { type: 'text', text: getEmojiForFaceId(String(data.id || '')) };

    case 'record':
      return data.path ? {
        type: 'audio',
        path: String(data.path),
        file: String(data.file || ''),
        url: data.url as string | undefined,
        fileSize: data.file_size ? parseInt(String(data.file_size), 10) : undefined,
      } : null;

    case 'file':
      return {
        type: 'file',
        fileId: String(data.file || ''),
        fileSize: data.file_size ? parseInt(String(data.file_size), 10) : undefined
      };

    case 'json':
      return parseJsonSegment(segment as NapCatJsonSegment);

    default:
      log.warn('adapters', `Unknown message type (inbound): ${segment.type}`);
      return null;
  }
}

// =============================================================================
// OpenClaw -> NapCat Adapters (Outbound)
// =============================================================================

function openClawSegmentToNapCat(
  content: OpenClawMessage
): NapCatMessage | null {
  switch (content.type) {
    case 'text':
      return { type: 'text', data: { text: content.text } };

    case 'at':
      return { type: 'at', data: { qq: content.isAll ? 'all' : content.userId } };

    case 'image':
      return { type: 'image', data: { file: content.url, url: content.url } };

    case 'reply':
      return { type: 'reply', data: { id: content.messageId } };

    case 'file':
      return { type: 'file', data: { file: content.file, url: content.url, file_size: content.fileSize } };

    case 'audio':
      return {
        type: 'record',
        data: { file: content.file, path: content.path, url: content.url, file_size: content.fileSize }
      };

    default:
      log.warn('adapters', `Unknown content type (outbound): ${(content as { type: string }).type}`);
      return null;
  }
}

export function openClawToNapCatMessage(content: OpenClawMessage[]): NapCatMessage[] {
  const segments: NapCatMessage[] = [];

  for (const item of content) {
    const segment = openClawSegmentToNapCat(item);
    if (segment) {
      segments.push(segment);
    }
  }

  return segments;
}

export async function napCatToOpenClawMessage(segments: NapCatMessage[] | string): Promise<OpenClawMessage[]> {
  const normalized = normalizeMessage(segments);

  const content: OpenClawMessage[] = [];

  for (const segment of normalized) {
    const result = await napCatToOpenClaw(segment);
    if (result) {
      content.push(result);
    }
  }

  return content;
}
