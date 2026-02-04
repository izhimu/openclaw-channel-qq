/**
 * Tests for security adapter
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveDmPolicy,
  isFriend,
  collectWarnings,
  createSecurityAdapter,
  type SecurityAdapter,
} from '../security.js';
import type { AccountConfig } from '../../types/index.js';
import type { ChannelSecurityContext } from 'openclaw/plugin-sdk';

describe('resolveDmPolicy', () => {
  const mockContext: ChannelSecurityContext<AccountConfig> = {
    cfg: {} as any,
    accountId: 'account-1',
    account: {
      accountId: 'account-1',
      wsUrl: 'ws://localhost:3001',
    },
  };

  it('should return null (use default OpenClaw behavior)', () => {
    const policy = resolveDmPolicy(mockContext);

    expect(policy).toBeNull();
  });
});

describe('isFriend', () => {
  it('should return true if user is in friend list', async () => {
    const result = await isFriend('123456', { friendList: ['123456', '789012'] });
    expect(result).toBe(true);
  });

  it('should return false if user is not in friend list', async () => {
    const result = await isFriend('999999', { friendList: ['123456', '789012'] });
    expect(result).toBe(false);
  });

  it('should query from connection if friend list not provided', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        data: [
          { user_id: 123456, nickname: 'Friend1' },
          { user_id: 789012, nickname: 'Friend2' },
        ],
      }),
    };

    const result = await isFriend('123456', { connection: mockConnection });

    expect(result).toBe(true);
    expect(mockConnection.sendRequest).toHaveBeenCalledWith('get_friend_list', {});
  });

  it('should return false if query fails', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockRejectedValue(new Error('Network error')),
    };

    const result = await isFriend('123456', { connection: mockConnection });

    expect(result).toBe(false);
  });

  it('should return false if no friend list or connection provided', async () => {
    const result = await isFriend('123456', {});
    expect(result).toBe(false);
  });
});

describe('collectWarnings', () => {
  const mockContext: ChannelSecurityContext<AccountConfig> = {
    cfg: {} as any,
    accountId: 'account-1',
    account: {
      accountId: 'account-1',
      wsUrl: 'ws://localhost:3001',
    },
  };

  it('should return QQ message limits warning', () => {
    const warnings = collectWarnings(mockContext);

    expect(warnings).toContain('QQ may filter or delay messages based on content and frequency');
  });

  it('should return recall limitations warning', () => {
    const warnings = collectWarnings(mockContext);

    expect(warnings).toContain('Messages can only be recalled within 2 minutes of sending');
  });

  it('should return all warnings', () => {
    const warnings = collectWarnings(mockContext);

    expect(warnings.length).toBe(2);
  });
});

describe('createSecurityAdapter', () => {
  it('should create adapter with all methods', () => {
    const adapter = createSecurityAdapter();

    expect(adapter.resolveDmPolicy).toBeDefined();
    expect(adapter.collectWarnings).toBeDefined();
    expect(adapter.isFriend).toBeDefined();
  });

  it('should resolve DM policy through adapter', () => {
    const adapter = createSecurityAdapter();

    const mockContext: ChannelSecurityContext<AccountConfig> = {
      cfg: {} as any,
      accountId: 'account-1',
      account: {
        accountId: 'account-1',
        wsUrl: 'ws://localhost:3001',
      },
    };

    const policy = adapter.resolveDmPolicy(mockContext);

    expect(policy).toBeNull();
  });

  it('should collect warnings through adapter', () => {
    const adapter = createSecurityAdapter();

    const mockContext: ChannelSecurityContext<AccountConfig> = {
      cfg: {} as any,
      accountId: 'account-1',
      account: {
        accountId: 'account-1',
        wsUrl: 'ws://localhost:3001',
      },
    };

    const warnings = adapter.collectWarnings(mockContext);

    expect(warnings.length).toBe(2);
    expect(warnings).toContain('QQ may filter or delay messages based on content and frequency');
    expect(warnings).toContain('Messages can only be recalled within 2 minutes of sending');
  });

  it('should check friend status through adapter with connection', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        data: [{ user_id: 123456, nickname: 'Friend' }],
      }),
    };

    const adapter = createSecurityAdapter({
      getConnection: () => mockConnection as any,
    });

    const result = await adapter.isFriend('123456', 'account-1');

    expect(result).toBe(true);
  });

  it('should return false for isFriend if connection not found', async () => {
    const adapter = createSecurityAdapter({
      getConnection: () => undefined,
    });

    const result = await adapter.isFriend('123456', 'account-1');

    expect(result).toBe(false);
  });
});
