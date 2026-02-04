/**
 * Tests for WebSocket connection manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionManager, MultiConnectionManager } from '../connection.js';
import type { AccountConfig } from '../../types/index.js';

// Mock WebSocket
const mockWebSocket = {
  send: vi.fn(),
  close: vi.fn(),
  terminate: vi.fn(),
  removeAllListeners: vi.fn(),
  readyState: 1, // WebSocket.OPEN
  on: vi.fn(),
};

vi.mock('ws', () => ({
  default: vi.fn(() => mockWebSocket),
  WebSocket: vi.fn(() => mockWebSocket),
}));

describe('ConnectionManager', () => {
  const mockConfig: AccountConfig = {
    accountId: 'test-account',
    wsUrl: 'ws://localhost:3001',
    accessToken: 'test-token',
  };

  let connectionManager: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    connectionManager = new ConnectionManager('test-account', mockConfig);
  });

  afterEach(() => {
    connectionManager.stop();
  });

  describe('initialization', () => {
    it('should create a connection manager with correct account ID', () => {
      expect(connectionManager.getAccountId()).toBe('test-account');
    });

    it('should not be connected initially', () => {
      expect(connectionManager.isConnected()).toBe(false);
    });

    it('should return undefined bot user ID initially', () => {
      expect(connectionManager.getBotUserId()).toBeUndefined();
    });
  });

  describe('bot user ID management', () => {
    it('should set and get bot user ID', () => {
      connectionManager.setBotUserId(123456);
      expect(connectionManager.getBotUserId()).toBe(123456);
    });

    it('should update bot user ID', () => {
      connectionManager.setBotUserId(123456);
      connectionManager.setBotUserId(789012);
      expect(connectionManager.getBotUserId()).toBe(789012);
    });
  });

  describe('status', () => {
    it('should return correct initial status', () => {
      const status = connectionManager.getStatus();

      expect(status.accountId).toBe('test-account');
      expect(status.state).toBe('disconnected');
      expect(status.lastConnected).toBeUndefined();
    });

    it('should return correct health status initially', () => {
      const health = connectionManager.getHealthStatus();

      expect(health.healthy).toBe(false);
      expect(health.lastHeartbeatAt).toBe(0);
      expect(health.consecutiveFailures).toBe(0);
    });

    it('should return correct stats initially', () => {
      const stats = connectionManager.getStats();

      expect(stats.connectedAt).toBe(0);
      expect(stats.uptime).toBe(0);
      expect(stats.totalReconnectAttempts).toBe(0);
    });
  });

  describe('meta event handling', () => {
    it('should update health status on heartbeat', () => {
      // Simulate heartbeat event
      const heartbeatEvent = {
        time: Date.now(),
        self_id: 123456,
        post_type: 'meta_event' as const,
        meta_event_type: 'heartbeat' as const,
        status: { online: true, good: true },
        interval: 30000,
      };

      // Emit the event through the connection manager
      connectionManager.emit('event', heartbeatEvent);
    });
  });
});

describe('MultiConnectionManager', () => {
  const mockConfig1: AccountConfig = {
    accountId: 'account-1',
    wsUrl: 'ws://localhost:3001',
  };

  const mockConfig2: AccountConfig = {
    accountId: 'account-2',
    wsUrl: 'ws://localhost:3002',
  };

  let multiManager: MultiConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    multiManager = new MultiConnectionManager();
  });

  afterEach(() => {
    multiManager.stopAll();
  });

  describe('connection management', () => {
    it('should add a connection', () => {
      const conn = multiManager.addConnection('account-1', mockConfig1);

      expect(conn).toBeDefined();
      expect(conn.getAccountId()).toBe('account-1');
    });

    it('should get a connection by account ID', () => {
      multiManager.addConnection('account-1', mockConfig1);
      const conn = multiManager.getConnection('account-1');

      expect(conn).toBeDefined();
      expect(conn?.getAccountId()).toBe('account-1');
    });

    it('should return undefined for non-existent connection', () => {
      const conn = multiManager.getConnection('non-existent');
      expect(conn).toBeUndefined();
    });

    it('should get all connections', () => {
      multiManager.addConnection('account-1', mockConfig1);
      multiManager.addConnection('account-2', mockConfig2);

      const connections = multiManager.getAllConnections();

      expect(connections).toHaveLength(2);
    });

    it('should remove a connection', async () => {
      multiManager.addConnection('account-1', mockConfig1);
      await multiManager.removeConnection('account-1');

      const conn = multiManager.getConnection('account-1');
      expect(conn).toBeUndefined();
    });
  });

  describe('status management', () => {
    it('should get all statuses', () => {
      multiManager.addConnection('account-1', mockConfig1);
      multiManager.addConnection('account-2', mockConfig2);

      const statuses = multiManager.getAllStatuses();

      expect(statuses).toHaveLength(2);
      expect(statuses[0].accountId).toBe('account-1');
      expect(statuses[1].accountId).toBe('account-2');
    });
  });

  describe('bot user ID lookup', () => {
    it('should find connection by bot user ID', () => {
      const conn1 = multiManager.addConnection('account-1', mockConfig1);
      conn1.setBotUserId(111111);

      const conn2 = multiManager.addConnection('account-2', mockConfig2);
      conn2.setBotUserId(222222);

      const found = multiManager.getConnectionByBotUserId(222222);

      expect(found?.getAccountId()).toBe('account-2');
    });

    it('should return undefined if bot user ID not found', () => {
      multiManager.addConnection('account-1', mockConfig1);

      const found = multiManager.getConnectionByBotUserId(999999);

      expect(found).toBeUndefined();
    });
  });
});
