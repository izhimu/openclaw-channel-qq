/**
 * WebSocket Connection Manager for NapCat
 * Handles per-account WebSocket connections with auto-reconnect and heartbeat
 */

import WebSocket from 'ws';
import EventEmitter from 'events';
import type {
  NapCatRequest,
  NapCatResponse,
  NapCatEvent,
  NapCatMetaEvent,
  AccountConfig,
  ConnectionState,
  ConnectionStatus,
  PendingRequest,
  HealthStatus,
} from '../types/index.js';
import {
  generateEchoId,
  delay,
  calculateBackoff,
  logDebug,
  logInfo,
  logWarn,
  logError,
  getCloseCodeMessage,
} from '../utils/index.js';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds - send active ping
const HEARTBEAT_TIMEOUT = 10000; // 10 seconds - consider connection dead if no response
const MAX_RECONNECT_ATTEMPTS = 10;
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Connection Manager for a single NapCat account
 */
export class ConnectionManager extends EventEmitter {
  private accountId: string;
  private config: AccountConfig;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private botUserId?: number;

  // Heartbeat - active ping + OneBot 11 meta_event based
  private heartbeatTimer?: NodeJS.Timeout;
  private heartbeatTimeoutTimer?: NodeJS.Timeout;
  private lastHeartbeatTime = 0;

  // Connection stats
  private connectedAt = 0;
  private totalReconnectAttempts = 0;

  // Reconnection
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private shouldReconnect = true;

  // Pending requests
  private pendingRequests = new Map<string, PendingRequest>();

  // Health status
  private healthStatus: HealthStatus = {
    healthy: false,
    lastHeartbeatAt: 0,
    consecutiveFailures: 0,
  };

  constructor(accountId: string, config: AccountConfig) {
    super();
    this.accountId = accountId;
    this.config = config;
  }

  // ==========================================================================
  // Connection Lifecycle
  // ==========================================================================

  /**
   * Start the connection
   */
  async start(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      logDebug('connection', `Already ${this.state} for account ${this.accountId}`);
      return;
    }

    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    await this.connect();
  }

  /**
   * Stop the connection
   */
  async stop(): Promise<void> {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.clearHeartbeatTimers();
    await this.close('Stopping connection');
    this.setState('disconnected');
  }

  /**
   * Establish WebSocket connection
   */
  private async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setState('connecting');

    try {
      // Build WebSocket URL with access_token query parameter (NapCat OneBot 11 standard)
      let wsUrl = this.config.wsUrl;
      if (this.config.accessToken) {
        const url = new URL(wsUrl);
        url.searchParams.set('access_token', this.config.accessToken);
        wsUrl = url.toString();
      }

      logInfo('connection', `Connecting to ${wsUrl} for account ${this.accountId}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', this.handleOpen.bind(this));
      this.ws.on('message', this.handleMessage.bind(this));
      this.ws.on('error', this.handleError.bind(this));
      this.ws.on('close', this.handleClose.bind(this));

      // Wait for connection to be established or failed
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 30000);

        this.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.once('failed', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      logError('connection', `Connection failed for account ${this.accountId}:`, error);
      this.handleConnectionFailed(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Close WebSocket connection
   */
  private async close(reason: string): Promise<void> {
    if (this.ws) {
      logDebug('connection', `Closing connection for account ${this.accountId}: ${reason}`);

      // Clear event listeners to prevent further processing
      this.ws.removeAllListeners();

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, reason);
      }

      this.ws = null;
    }
  }

  // ==========================================================================
  // WebSocket Event Handlers
  // ==========================================================================

  private handleOpen(): void {
    logInfo('connection', `Connected to NapCat for account ${this.accountId}`);
    this.setState('connected');
    this.connectedAt = Date.now();
    this.totalReconnectAttempts += this.reconnectAttempts;
    this.reconnectAttempts = 0;
    this.startHeartbeat();
    this.emit('connected');
  }

  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as NapCatResponse | NapCatEvent;

      // Handle response to a request
      if ('echo' in message && message.echo) {
        this.handleResponse(message as NapCatResponse);
        return;
      }

      // Handle meta_event (heartbeat/lifecycle)
      if ('post_type' in message && message.post_type === 'meta_event') {
        this.handleMetaEvent(message as NapCatMetaEvent);
        return;
      }

      // Handle event
      if ('post_type' in message) {
        this.emit('event', message as NapCatEvent);
        return;
      }

      // Handle response without echo (unsolicited)
      logDebug('connection', `Received unsolicited response:`, message);

    } catch (error) {
      logError('connection', `Failed to parse message:`, error);
    }
  }

  /**
   * Handle OneBot 11 meta_event (lifecycle and heartbeat)
   */
  private handleMetaEvent(event: NapCatMetaEvent): void {
    if (event.meta_event_type === 'heartbeat') {
      // NapCat sent us a heartbeat - update health status
      this.lastHeartbeatTime = Date.now();
      this.healthStatus = {
        healthy: true,
        lastHeartbeatAt: this.lastHeartbeatTime,
        consecutiveFailures: 0,
      };

      logDebug('connection', `Received heartbeat for account ${this.accountId}`);
      this.emit('heartbeat', this.healthStatus);
    } else if (event.meta_event_type === 'lifecycle') {
      logInfo('connection', `Lifecycle event for account ${this.accountId}: ${event.sub_type}`);
      this.emit('lifecycle', event);
    }
  }

  private handleError(error: Error): void {
    logError('connection', `WebSocket error for account ${this.accountId}:`, error.message);
    // Don't set state here, let close handler handle it
  }

  private handleClose(code: number, reason: Buffer): void {
    const reasonStr = reason.toString() || getCloseCodeMessage(code);
    logWarn('connection', `Connection closed for account ${this.accountId}: ${code} - ${reasonStr}`);

    this.clearHeartbeatTimers();

    if (this.shouldReconnect && !this.isNormalClosure(code)) {
      this.scheduleReconnect();
    } else {
      this.setState('disconnected');
    }
  }

  private isNormalClosure(code: number): boolean {
    return code === 1000 || code === 1001;
  }

  private handleConnectionFailed(error: Error): void {
    this.setState('failed', error.message);
    this.emit('failed', error);

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  // ==========================================================================
  // Reconnection Logic
  // ==========================================================================

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logError('connection', `Max reconnect attempts reached for account ${this.accountId}`);
      this.setState('failed', 'Max reconnect attempts reached');
      this.emit('max-reconnect-attempts-reached');
      return;
    }

    const delayMs = calculateBackoff(this.reconnectAttempts);
    logInfo('connection', `Scheduling reconnect in ${delayMs}ms for account ${this.accountId} (attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();
      } catch (error) {
        // Reconnect failed, will schedule another attempt
      }
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  // ==========================================================================
  // Heartbeat Logic (active ping + OneBot 11 meta_event based)
  // ==========================================================================

  private startHeartbeat(): void {
    this.clearHeartbeatTimers();
    this.lastHeartbeatTime = Date.now();

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);

    logDebug('connection', `Started heartbeat for account ${this.accountId}`);
  }

  private sendHeartbeat(): void {
    if (!this.isConnected()) {
      this.clearHeartbeatTimers();
      return;
    }

    try {
      // Send a minimal ping message
      this.ws?.send(JSON.stringify({ ping: Date.now() }));

      // Set timeout to detect if we don't receive a response
      this.heartbeatTimeoutTimer = setTimeout(() => {
        logWarn('connection', `Heartbeat timeout for account ${this.accountId}`);
        this.healthStatus.healthy = false;
        this.healthStatus.consecutiveFailures++;
        this.emit('heartbeat-timeout');
        // Force close and reconnect - use terminate() instead of close() for abnormal closure
        this.ws?.terminate();
      }, HEARTBEAT_TIMEOUT);

      logDebug('connection', `Sent heartbeat for account ${this.accountId}`);

    } catch (error) {
      logError('connection', `Failed to send heartbeat:`, error);
    }
  }

  private clearHeartbeatTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = undefined;
    }
  }

  // ==========================================================================
  // Request/Response Handling
  // ==========================================================================

  /**
   * Send a request and wait for response
   */
  async sendRequest<T = unknown>(
    action: string,
    params?: Record<string, unknown>
  ): Promise<NapCatResponse<T>> {
    if (!this.isConnected()) {
      throw new Error(`Not connected for account ${this.accountId}`);
    }

    const echo = generateEchoId();

    return new Promise<NapCatResponse<T>>((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(echo);
        reject(new Error(`Request timeout: ${action}`));
      }, REQUEST_TIMEOUT);

      // Store pending request
      this.pendingRequests.set(echo, {
        resolve: resolve as (response: NapCatResponse) => void,
        reject,
        timeout,
      });

      // Send request
      const request: NapCatRequest = {
        action: action as any,
        params,
        echo,
      };

      try {
        this.ws?.send(JSON.stringify(request));
        logDebug('connection', `Sent request: ${action} (echo: ${echo})`);
      } catch (error) {
        this.pendingRequests.delete(echo);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private handleResponse(response: NapCatResponse): void {
    const { echo } = response;
    if (!echo) {
      return;
    }

    const pending = this.pendingRequests.get(echo);
    if (!pending) {
      logDebug('connection', `Received response for unknown request: ${echo}`);
      return;
    }

    this.pendingRequests.delete(echo);
    clearTimeout(pending.timeout);

    if (response.status === 'ok') {
      pending.resolve(response);
    } else {
      pending.reject(new Error(response.msg || 'Request failed'));
    }

    logDebug('connection', `Received response for echo: ${echo}`);
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  private setState(
    state: ConnectionState,
    error?: string
  ): void {
    const oldState = this.state;
    this.state = state;

    logInfo('connection', `State changed for account ${this.accountId}: ${oldState} -> ${state}`);

    if (state === 'connected') {
      this.lastHeartbeatTime = Date.now();
    }

    this.emit('state-changed', this.getStatus());
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return {
      accountId: this.accountId,
      state: this.state,
      lastConnected: this.lastHeartbeatTime || undefined,
      lastAttempted: this.reconnectAttempts > 0 ? Date.now() : undefined,
      error: this.state === 'failed' ? 'Connection failed' : undefined,
      reconnectAttempts: this.reconnectAttempts > 0 ? this.reconnectAttempts : undefined,
    };
  }

  /**
   * Get connection health status
   */
  getHealthStatus(): HealthStatus {
    return this.healthStatus;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    connectedAt: number;
    uptime: number;
    totalReconnectAttempts: number;
  } {
    const now = Date.now();
    return {
      connectedAt: this.connectedAt,
      uptime: this.state === 'connected' && this.connectedAt > 0 ? now - this.connectedAt : 0,
      totalReconnectAttempts: this.totalReconnectAttempts + this.reconnectAttempts,
    };
  }

  /**
   * Get the account ID
   */
  getAccountId(): string {
    return this.accountId;
  }

  /**
   * Get the bot user ID (if known)
   */
  getBotUserId(): number | undefined {
    return this.botUserId;
  }

  /**
   * Set the bot user ID
   */
  setBotUserId(userId: number): void {
    this.botUserId = userId;
  }
}

/**
 * Multi-connection manager for handling multiple NapCat accounts
 */
export class MultiConnectionManager extends EventEmitter {
  private connections = new Map<string, ConnectionManager>();

  /**
   * Add a connection for an account
   */
  addConnection(accountId: string, config: AccountConfig): ConnectionManager {
    const existing = this.connections.get(accountId);
    if (existing) {
      existing.stop();
    }

    const conn = new ConnectionManager(accountId, config);

    // Forward events
    conn.on('connected', () => this.emit('account-connected', accountId));
    conn.on('state-changed', (status) => this.emit('account-state-changed', accountId, status));
    conn.on('event', (event) => this.emit('event', accountId, event));
    conn.on('max-reconnect-attempts-reached', () => this.emit('account-failed', accountId));

    this.connections.set(accountId, conn);
    return conn;
  }

  /**
   * Remove a connection
   */
  async removeConnection(accountId: string): Promise<void> {
    const conn = this.connections.get(accountId);
    if (conn) {
      await conn.stop();
      this.connections.delete(accountId);
    }
  }

  /**
   * Get a connection by account ID
   */
  getConnection(accountId: string): ConnectionManager | undefined {
    return this.connections.get(accountId);
  }

  /**
   * Get all connections
   */
  getAllConnections(): ConnectionManager[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get all connection statuses
   */
  getAllStatuses(): ConnectionStatus[] {
    return Array.from(this.connections.values()).map(conn => conn.getStatus());
  }

  /**
   * Start all connections
   */
  async startAll(): Promise<void> {
    await Promise.all(
      Array.from(this.connections.values()).map(conn => conn.start())
    );
  }

  /**
   * Stop all connections
   */
  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.connections.values()).map(conn => conn.stop())
    );
  }

  /**
   * Get connection by user ID (for routing incoming messages)
   */
  getConnectionByBotUserId(botUserId: number): ConnectionManager | undefined {
    return Array.from(this.connections.values()).find(
      conn => conn.getBotUserId() === botUserId
    );
  }
}
