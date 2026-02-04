/**
 * Tests for directory adapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  self,
  listPeers,
  listGroups,
  listGroupMembers,
  findPeer,
  findGroup,
  findGroupMember,
  invalidateAccountCache,
  createDirectoryAdapter,
} from '../directory.js';

describe('self', () => {
  beforeEach(() => {
    // Clear all caches before each test
    invalidateAccountCache('account-1');
  });
  it('should return self info on success', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: {
          user_id: 123456,
          nickname: 'TestBot',
        },
      }),
    };

    const result = await self('account-1', mockConnection as any);

    expect(result).toEqual({
      id: '123456',
      name: 'TestBot',
      nickname: 'TestBot',
    });
  });

  it('should return null on failure', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockRejectedValue(new Error('Network error')),
    };

    const result = await self('account-1', mockConnection as any);

    expect(result).toBeNull();
  });
});

describe('listPeers', () => {
  beforeEach(() => {
    invalidateAccountCache('account-1');
  });

  it('should return friend list', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [
          { user_id: 111111, nickname: 'Friend1', remark: 'Best Friend' },
          { user_id: 222222, nickname: 'Friend2' },
        ],
      }),
    };

    const result = await listPeers('account-1', mockConnection as any);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: '111111', name: 'Best Friend', nickname: 'Friend1' });
    expect(result[1]).toEqual({ id: '222222', name: 'Friend2', nickname: 'Friend2' });
  });

  it('should cache results', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [{ user_id: 111111, nickname: 'Friend1' }],
      }),
    };

    // First call should hit the API
    await listPeers('account-1', mockConnection as any);
    expect(mockConnection.sendRequest).toHaveBeenCalledTimes(1);

    // Second call should use cache
    await listPeers('account-1', mockConnection as any);
    expect(mockConnection.sendRequest).toHaveBeenCalledTimes(1);
  });

  it('should bypass cache with forceRefresh', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [{ user_id: 111111, nickname: 'Friend1' }],
      }),
    };

    // First call
    await listPeers('account-1', mockConnection as any);
    // Second call with forceRefresh
    await listPeers('account-1', mockConnection as any, { forceRefresh: true });

    expect(mockConnection.sendRequest).toHaveBeenCalledTimes(2);
  });

  it('should return empty array on failure', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockRejectedValue(new Error('Network error')),
    };

    const result = await listPeers('account-1', mockConnection as any);

    expect(result).toEqual([]);
  });
});

describe('listGroups', () => {
  beforeEach(() => {
    invalidateAccountCache('account-1');
  });

  it('should return group list', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [
          { group_id: 111111, group_name: 'Group1', member_count: 50, max_member_count: 200 },
          { group_id: 222222, group_name: 'Group2', member_count: 10, max_member_count: 500 },
        ],
      }),
    };

    const result = await listGroups('account-1', mockConnection as any);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: '111111',
      name: 'Group1',
      memberCount: 50,
      maxMembers: 200,
    });
  });

  it('should cache results', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [{ group_id: 111111, group_name: 'Group1' }],
      }),
    };

    await listGroups('account-1', mockConnection as any);
    await listGroups('account-1', mockConnection as any);

    expect(mockConnection.sendRequest).toHaveBeenCalledTimes(1);
  });

  it('should return empty array on failure', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockRejectedValue(new Error('Network error')),
    };

    const result = await listGroups('account-1', mockConnection as any);

    expect(result).toEqual([]);
  });
});

describe('listGroupMembers', () => {
  beforeEach(() => {
    invalidateAccountCache('account-1');
  });

  it('should return group member list', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [
          { user_id: 111111, nickname: 'Member1', card: 'Admin', role: 'admin' },
          { user_id: 222222, nickname: 'Member2', role: 'member' },
        ],
      }),
    };

    const result = await listGroupMembers('account-1', 'group-1', mockConnection as any);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: '111111',
      name: 'Member1',
      card: 'Admin',
      role: 'admin',
    });
  });

  it('should cache results per group', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [{ user_id: 111111, nickname: 'Member1' }],
      }),
    };

    await listGroupMembers('account-1', 'group-1', mockConnection as any);
    await listGroupMembers('account-1', 'group-1', mockConnection as any);

    expect(mockConnection.sendRequest).toHaveBeenCalledTimes(1);
  });

  it('should have separate cache for different groups', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [{ user_id: 111111, nickname: 'Member1' }],
      }),
    };

    await listGroupMembers('account-1', 'group-1', mockConnection as any);
    await listGroupMembers('account-1', 'group-2', mockConnection as any);

    expect(mockConnection.sendRequest).toHaveBeenCalledTimes(2);
  });

  it('should return empty array on failure', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockRejectedValue(new Error('Network error')),
    };

    const result = await listGroupMembers('account-1', 'group-1', mockConnection as any);

    expect(result).toEqual([]);
  });
});

describe('findPeer', () => {
  beforeEach(() => {
    invalidateAccountCache('account-1');
  });

  it('should find peer by ID', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [
          { user_id: 111111, nickname: 'Friend1' },
          { user_id: 222222, nickname: 'Friend2' },
        ],
      }),
    };

    const result = await findPeer('account-1', '222222', mockConnection as any);

    expect(result).toEqual({ id: '222222', name: 'Friend2', nickname: 'Friend2' });
  });

  it('should return null if peer not found', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [{ user_id: 111111, nickname: 'Friend1' }],
      }),
    };

    const result = await findPeer('account-1', '999999', mockConnection as any);

    expect(result).toBeNull();
  });
});

describe('findGroup', () => {
  beforeEach(() => {
    invalidateAccountCache('account-1');
  });

  it('should find group by ID', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [
          { group_id: 111111, group_name: 'Group1' },
          { group_id: 222222, group_name: 'Group2' },
        ],
      }),
    };

    const result = await findGroup('account-1', '222222', mockConnection as any);

    expect(result).toMatchObject({ id: '222222', name: 'Group2' });
  });

  it('should return null if group not found', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [{ group_id: 111111, group_name: 'Group1' }],
      }),
    };

    const result = await findGroup('account-1', '999999', mockConnection as any);

    expect(result).toBeNull();
  });
});

describe('findGroupMember', () => {
  beforeEach(() => {
    invalidateAccountCache('account-1');
  });

  it('should find member by ID', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [
          { user_id: 111111, nickname: 'Member1' },
          { user_id: 222222, nickname: 'Member2' },
        ],
      }),
    };

    const result = await findGroupMember('account-1', 'group-1', '222222', mockConnection as any);

    expect(result).toMatchObject({ id: '222222', name: 'Member2' });
  });

  it('should return null if member not found', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: [{ user_id: 111111, nickname: 'Member1' }],
      }),
    };

    const result = await findGroupMember('account-1', 'group-1', '999999', mockConnection as any);

    expect(result).toBeNull();
  });
});

describe('createDirectoryAdapter', () => {
  it('should create adapter with all methods', () => {
    const adapter = createDirectoryAdapter({
      getConnection: () => undefined,
    });

    expect(adapter.self).toBeDefined();
    expect(adapter.listPeers).toBeDefined();
    expect(adapter.listGroups).toBeDefined();
    expect(adapter.listGroupMembers).toBeDefined();
    expect(adapter.invalidateAccountCache).toBeDefined();
  });

  it('should throw if connection not found', async () => {
    const adapter = createDirectoryAdapter({
      getConnection: () => undefined,
    });

    let error: Error | undefined;
    try {
      await adapter.self({ accountId: 'account-1' });
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Connection not found');
  });

  it('should call methods with connection', async () => {
    const mockConnection = {
      sendRequest: vi.fn().mockResolvedValue({
        status: 'ok',
        data: { user_id: 123456, nickname: 'Bot' },
      }),
    };

    const adapter = createDirectoryAdapter({
      getConnection: () => mockConnection as any,
    });

    const result = await adapter.self({ accountId: 'account-1' });

    expect(result).toEqual({
      kind: 'user',
      id: '123456',
      name: 'Bot',
      handle: 'Bot',
      raw: { id: '123456', name: 'Bot', nickname: 'Bot' },
    });
  });
});
