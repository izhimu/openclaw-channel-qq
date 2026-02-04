/**
 * Tests for message adapters
 */

import { describe, it, expect } from 'vitest';
import {
  napCatToOpenClawMessage,
  openClawToNapCatMessage,
  extractPlainTextFromSegments,
  getMessageSummary,
  isPlainTextMessage,
  createTextContent,
  createAtContent,
  createImageContent,
  createReplyContent,
  recallMessage,
  type RecallResult,
} from '../message.js';
import type {
  NapCatMessageSegment,
  NapCatTextSegment,
  NapCatAtSegment,
  NapCatImageSegment,
  NapCatReplySegment,
  OpenClawMessageContent,
} from '../../types/index.js';

describe('napCatToOpenClawMessage', () => {
  it('should convert text segments', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'text', data: { text: 'Hello world' } },
    ];

    const result = napCatToOpenClawMessage(segments);

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello world' });
    expect(result.isMention).toBe(false);
  });

  it('should convert at segments', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'at', data: { qq: '123456', name: 'User' } },
    ];

    const result = napCatToOpenClawMessage(segments);

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'at', userId: '123456', isAll: false });
  });

  it('should convert @all segments', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'at', data: { qq: 'all' } },
    ];

    const result = napCatToOpenClawMessage(segments);

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'at', userId: 'all', isAll: true });
  });

  it('should convert image segments', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'image', data: { file: 'image.png', url: 'https://example.com/image.png' } },
    ];

    const result = napCatToOpenClawMessage(segments);

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'image', url: 'https://example.com/image.png' });
  });

  it('should convert reply segments', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'reply', data: { id: '12345' } },
    ];

    const result = napCatToOpenClawMessage(segments);

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'reply', messageId: '12345' });
  });

  it('should detect mention of bot', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'at', data: { qq: '987654' } },
    ];

    const result = napCatToOpenClawMessage(segments, 987654);

    expect(result.isMention).toBe(true);
  });

  it('should handle mixed content', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'text', data: { text: 'Hello ' } },
      { type: 'at', data: { qq: '123456' } },
      { type: 'text', data: { text: ' check this out:' } },
      { type: 'image', data: { file: 'img.png', url: 'https://example.com/img.png' } },
    ];

    const result = napCatToOpenClawMessage(segments);

    expect(result.content).toHaveLength(4);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello ' });
    expect(result.content[1]).toEqual({ type: 'at', userId: '123456', isAll: false });
  });

  it('should handle string message format', () => {
    const result = napCatToOpenClawMessage('Hello world');

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('should convert json segments', () => {
    const jsonData = '{"app":"com.tencent.map","prompt":"[位置]测试地点"}';
    const segments: NapCatMessageSegment[] = [
      { type: 'json', data: { data: jsonData } },
    ];

    const result = napCatToOpenClawMessage(segments);

    expect(result.content).toHaveLength(1);
    const jsonContent = result.content[0];
    if (jsonContent.type === 'json') {
      expect(jsonContent.data).toBe(jsonData);
      expect(jsonContent.prompt).toBe('[位置]测试地点');
    } else {
      throw new Error('Expected json content type');
    }
  });

  it('should handle json segments with unparseable data', () => {
    const invalidJson = '{invalid json';
    const segments: NapCatMessageSegment[] = [
      { type: 'json', data: { data: invalidJson } },
    ];

    const result = napCatToOpenClawMessage(segments);

    expect(result.content).toHaveLength(1);
    const jsonContent = result.content[0];
    if (jsonContent.type === 'json') {
      expect(jsonContent.data).toBe(invalidJson);
      expect(jsonContent.prompt).toBeUndefined();
    } else {
      throw new Error('Expected json content type');
    }
  });
});

describe('openClawToNapCatMessage', () => {
  it('should convert text content', () => {
    const content: OpenClawMessageContent[] = [
      { type: 'text', text: 'Hello world' },
    ];

    const result = openClawToNapCatMessage(content);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'text', data: { text: 'Hello world' } });
  });

  it('should convert at content', () => {
    const content: OpenClawMessageContent[] = [
      { type: 'at', userId: '123456', isAll: false },
    ];

    const result = openClawToNapCatMessage(content);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'at', data: { qq: '123456' } });
  });

  it('should convert @all content', () => {
    const content: OpenClawMessageContent[] = [
      { type: 'at', userId: 'all', isAll: true },
    ];

    const result = openClawToNapCatMessage(content);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'at', data: { qq: 'all' } });
  });

  it('should convert image content', () => {
    const content: OpenClawMessageContent[] = [
      { type: 'image', url: 'https://example.com/image.png' },
    ];

    const result = openClawToNapCatMessage(content);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'image', data: { file: 'https://example.com/image.png', url: 'https://example.com/image.png' } });
  });

  it('should convert reply content', () => {
    const content: OpenClawMessageContent[] = [
      { type: 'reply', messageId: '12345' },
    ];

    const result = openClawToNapCatMessage(content);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'reply', data: { id: '12345' } });
  });

  it('should add reply segment when replyToId is provided', () => {
    const content: OpenClawMessageContent[] = [
      { type: 'text', text: 'Hello' },
    ];

    const result = openClawToNapCatMessage(content, 'reply123');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'reply', data: { id: 'reply123' } });
    expect(result[1]).toEqual({ type: 'text', data: { text: 'Hello' } });
  });

  it('should handle empty content', () => {
    const result = openClawToNapCatMessage([]);
    expect(result).toHaveLength(0);
  });
});

describe('extractPlainTextFromSegments', () => {
  it('should extract text from segments', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'text', data: { text: 'Hello ' } },
      { type: 'at', data: { qq: '123', name: 'User' } },
      { type: 'text', data: { text: ' world' } },
    ];

    const result = extractPlainTextFromSegments(segments);

    expect(result).toBe('Hello @User world');
  });

  it('should handle image segments', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'text', data: { text: 'Check this: ' } },
      { type: 'image', data: { file: 'img.png' } },
    ];

    const result = extractPlainTextFromSegments(segments);

    expect(result).toBe('Check this: [图片]');
  });
});

describe('getMessageSummary', () => {
  it('should return full text for short messages', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'text', data: { text: 'Hello world' } },
    ];

    const result = getMessageSummary(segments);

    expect(result).toBe('Hello world');
  });

  it('should truncate long messages', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'text', data: { text: 'A'.repeat(100) } },
    ];

    const result = getMessageSummary(segments, 50);

    expect(result).toBe('A'.repeat(50) + '...');
  });
});

describe('isPlainTextMessage', () => {
  it('should return true for single text segment', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'text', data: { text: 'Hello' } },
    ];

    expect(isPlainTextMessage(segments)).toBe(true);
  });

  it('should return false for multiple segments', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'text', data: { text: 'Hello ' } },
      { type: 'at', data: { qq: '123' } },
    ];

    expect(isPlainTextMessage(segments)).toBe(false);
  });

  it('should return false for non-text segment', () => {
    const segments: NapCatMessageSegment[] = [
      { type: 'image', data: { file: 'img.png' } },
    ];

    expect(isPlainTextMessage(segments)).toBe(false);
  });
});

describe('content creation helpers', () => {
  it('createTextContent should create text content', () => {
    const result = createTextContent('Hello');
    expect(result).toEqual({ type: 'text', text: 'Hello' });
  });

  it('createAtContent should create at content', () => {
    const result = createAtContent('123456');
    expect(result).toEqual({ type: 'at', userId: '123456', isAll: false });
  });

  it('createAtContent should create @all content', () => {
    const result = createAtContent('all', true);
    expect(result).toEqual({ type: 'at', userId: 'all', isAll: true });
  });

  it('createImageContent should create image content', () => {
    const result = createImageContent('https://example.com/img.png');
    expect(result).toEqual({ type: 'image', url: 'https://example.com/img.png' });
  });

  it('createReplyContent should create reply content', () => {
    const result = createReplyContent('msg123');
    expect(result).toEqual({ type: 'reply', messageId: 'msg123' });
  });
});

describe('recallMessage', () => {
  it('should return success for successful recall', async () => {
    const mockConnection = {
      sendRequest: async <T>(_action: string, _params?: Record<string, unknown>) =>
        ({ status: 'ok', data: undefined }) as { status: string; msg?: string; data?: T },
    };

    const result = await recallMessage('12345', mockConnection);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return error for failed recall', async () => {
    const mockConnection = {
      sendRequest: async (_action: string, _params?: Record<string, unknown>) => ({ status: 'failed', msg: 'Message not found' }),
    };

    const result = await recallMessage('12345', mockConnection);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Message not found or already recalled');
    expect(result.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('should handle timeout error', async () => {
    const mockConnection = {
      sendRequest: async (_action: string, _params?: Record<string, unknown>) => ({ status: 'failed', msg: 'timeout' }),
    };

    const result = await recallMessage('12345', mockConnection);

    expect(result.success).toBe(false);
    expect(result.code).toBe('RECALL_TIMEOUT');
  });

  it('should handle permission error', async () => {
    const mockConnection = {
      sendRequest: async (_action: string, _params?: Record<string, unknown>) => ({ status: 'failed', msg: 'permission denied' }),
    };

    const result = await recallMessage('12345', mockConnection);

    expect(result.success).toBe(false);
    expect(result.code).toBe('PERMISSION_DENIED');
  });

  it('should handle network errors', async () => {
    const mockConnection = {
      sendRequest: async (_action: string, _params?: Record<string, unknown>) => {
        throw new Error('Network error');
      },
    };

    const result = await recallMessage('12345', mockConnection);

    expect(result.success).toBe(false);
    expect(result.code).toBe('RECALL_ERROR');
  });

  it('should handle numeric message ID', async () => {
    const mockConnection = {
      sendRequest: async <T>(_action: string, params?: Record<string, unknown>) => {
        expect(params?.message_id).toBe(12345);
        return { status: 'ok', data: undefined } as { status: string; msg?: string; data?: T };
      },
    };

    const result = await recallMessage(12345, mockConnection);
    expect(result.success).toBe(true);
  });
});
