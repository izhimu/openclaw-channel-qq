/**
 * WebSocket Connection Manager for NapCat
 * Handles per-account WebSocket connections with auto-reconnect and heartbeat
 */

import WebSocket from 'ws';
import EventEmitter from 'events';
import type {
  NapCatReq,
  NapCatResp,
  NapCatEvent,
  NapCatMetaEvent,
  QQConfig,
  ConnectionState,
  ConnectionStatus,
  PendingRequest,
  HealthStatus, NapCatAction,
} from '../types';
import {
  Logger as log,
  generateEchoId,
  calculateBackoff,
  getCloseCodeMessage,
} from '../utils/index.js';

const MAX_RECONNECT_ATTEMPTS = -1;
const REQUEST_TIMEOUT = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 120000; // 120 seconds - time without heartbeat before reconnecting (increased for NapCat compatibility)
const HEARTBEAT_CHECK_INTERVAL = 60000; // 60 seconds - how often to check for heartbeat timeout

/**
 * Connection Manager for a single NapCat account
 */
export class ConnectionManager extends EventEmitter {
  private config: QQConfig;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';

  // Heartbeat - active ping + OneBot 11 meta_event based
  private lastHeartbeatTime = 0;
  private heartbeatCheckTimer?: NodeJS.Timeout;

  // Reconnection
  private reconnectTimer?: NodeJS.Timeout;
  private totalReconnectAttempts = 0;
  private shouldReconnect = true;

  // Pending requests
  private pendingRequests = new Map<string, PendingRequest>();

  // Health status
  private healthStatus: HealthStatus = {
    healthy: false,
    lastHeartbeatAt: 0,
    consecutiveFailures: 0,
  };

  constructor(config: QQConfig) {
    super();
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
      log.debug('connection', `Already ${this.state}`);
      return;
    }

    this.shouldReconnect = true;
    await this.connect();
    log.info('connection', `Started connection`)
  }

  /**
   * Stop the connection
   */
  async stop(): Promise<void> {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    await this.close('Stopping connection');
    this.setState('disconnected');
    log.info('connection', `Stopped connection`)
  }

  /**
   * Establish WebSocket connection
   */
  private async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // 防御性清理：确保旧连接和监听器被清理，避免潜在的内存泄漏
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }

    this.setState('connecting');

    try {
      // Build WebSocket URL with access_token query parameter (NapCat OneBot 11 standard)
      let wsUrl = this.config.wsUrl;

      // Validate URL format before processing
      if (!wsUrl || !wsUrl.match(/^wss?:\/\//)) {
        log.error('connection', `Invalid WebSocket URL: ${wsUrl}`)
        return;
      }

      if (this.config.accessToken) {
        try {
          const url = new URL(wsUrl);
          url.searchParams.set('access_token', this.config.accessToken);
          wsUrl = url.toString();
        } catch (urlError) {
          log.error('connection', `Failed to parse WebSocket URL: ${wsUrl}`)
          return;
        }
      }

      // Sanitize URL for logging (hide access token)
      const sanitizedUrl = wsUrl.replace(/access_token=[^&]+/, 'access_token=***');
      log.info('connection', `Connecting to ${sanitizedUrl}`);

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
      log.error('connection', `Connection failed:`, error);
      this.handleConnectionFailed(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Clear all pending requests and reject them with an error
   */
  private clearPendingRequests(reason: string): void {
    if (this.pendingRequests.size === 0) {
      return;
    }

    log.debug('connection', `Clearing ${this.pendingRequests.size} pending requests: ${reason}`);

    for (const [_echo, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Connection closed: ${reason}`));
    }

    this.pendingRequests.clear();
  }

  // ==========================================================================
  // Heartbeat Timeout Detection
  // ==========================================================================

  /**
   * Start heartbeat timeout detection
   */
  private startHeartbeatCheck(): void {
    this.stopHeartbeatCheck();

    this.heartbeatCheckTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastHeartbeatTime;

      if (elapsed > HEARTBEAT_TIMEOUT && this.isConnected()) {
        log.warn('connection', `Heartbeat timeout (${elapsed}ms since last heartbeat), reconnecting...`);
        this.healthStatus = {
          healthy: false,
          lastHeartbeatAt: this.lastHeartbeatTime,
          consecutiveFailures: this.healthStatus.consecutiveFailures + 1,
        };
        this.emit('heartbeat', this.healthStatus);

        // Close connection and trigger immediate reconnect
        this.setState('disconnected');
        this.close('Heartbeat timeout').then(() => {
          if (this.shouldReconnect) {
            // Increment total reconnect attempts
            this.totalReconnectAttempts++;

            // Emit reconnecting event for external status updates
            this.emit('reconnecting', {
              reason: 'heartbeat-timeout',
              totalAttempts: this.totalReconnectAttempts,
            });

            this.connect().catch(error => {
              log.error('connection', `Reconnect failed:`, error);
            });
          }
        });
      }
    }, HEARTBEAT_CHECK_INTERVAL);

    log.debug('connection', 'Started heartbeat timeout detection');
  }

  /**
   * Stop heartbeat timeout detection
   */
  private stopHeartbeatCheck(): void {
    if (this.heartbeatCheckTimer) {
      clearInterval(this.heartbeatCheckTimer);
      this.heartbeatCheckTimer = undefined;
      log.debug('connection', 'Stopped heartbeat timeout detection');
    }
  }

  /**
   * Close WebSocket connection
   */
  private async close(reason: string): Promise<void> {
    // Stop heartbeat detection
    this.stopHeartbeatCheck();

    // Clear all pending requests before closing connection
    this.clearPendingRequests(reason);

    if (this.ws) {
      log.info('connection', `Closing connection: ${reason}`);

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
    log.info('connection', `Connected to NapCat`);
    this.setState('connected');
    // Start heartbeat timeout detection
    this.startHeartbeatCheck();
    this.emit('connected');
  }

  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as NapCatResp | NapCatEvent;

      // Handle response to a request
      if ('echo' in message && message.echo) {
        this.handleResponse(message as NapCatResp);
        return;
      }

      // Handle meta_event (heartbeat/lifecycle)
      if ('post_type' in message && message.post_type === 'meta_event') {
        this.handleMetaEvent(message as NapCatMetaEvent);
        return;
      }

      // Handle event
      if ('post_type' in message) {
        this.emit('event', message);
        return;
      }

      log.debug('connection', `Received unsolicited response:`, message);
    } catch (error) {
      log.error('connection', `Failed to parse message:`, error);
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

      log.debug('connection', `Received heartbeat`);
      this.emit('heartbeat', this.healthStatus);
    } else if (event.meta_event_type === 'lifecycle') {
      log.info('connection', `Lifecycle event: ${event.sub_type}`);
      this.emit('lifecycle', event);
    }
  }

  private handleError(error: Error): void {
    log.error('connection', `WebSocket error:`, error.message);
  }

  private handleClose(code: number, reason: Buffer): void {
    const reasonStr = reason.toString() || getCloseCodeMessage(code);
    log.warn('connection', `Connection closed: ${code} - ${reasonStr}`);

    // 停止心跳检测
    this.stopHeartbeatCheck();

    // 如果 ws 已经为 null，说明是主动关闭（如心跳超时），不需要再处理
    if (this.ws === null) {
      return;
    }

    if (this.shouldReconnect && !this.isNormalClosure(code)) {
      this.scheduleReconnect();
    } else {
      this.setState('disconnected');
    }
  }

  private handleConnectionFailed(error: Error): void {
    this.setState('failed', error.message);
    this.emit('failed', error);

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  private handleResponse(response: NapCatResp): void {
    const { echo } = response;
    if (!echo) {
      return;
    }

    const pending = this.pendingRequests.get(echo);
    if (!pending) {
      log.debug('connection', `Received response for unknown request: ${echo}`);
      return;
    }

    this.pendingRequests.delete(echo);
    clearTimeout(pending.timeout);

    if (response.status === 'ok') {
      pending.resolve(response);
    } else {
      pending.reject(new Error(response.msg || 'Request failed'));
    }

    log.debug('connection', `Received response for echo: ${echo}`);
  }

  private isNormalClosure(code: number): boolean {
    return code === 1000 || code === 1001;
  }

  // ==========================================================================
  // Reconnection Logic
  // ==========================================================================

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) {
      return;
    }

    if (MAX_RECONNECT_ATTEMPTS != -1 && this.totalReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      log.error('connection', `Max reconnect attempts reached`);
      this.setState('failed', 'Max reconnect attempts reached');
      this.emit('max-reconnect-attempts-reached');
      return;
    }

    const delayMs = calculateBackoff(this.totalReconnectAttempts);
    log.info('connection', `Scheduling reconnect in ${delayMs}ms (attempt ${this.totalReconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(async () => {
      this.totalReconnectAttempts++;
      try {
        await this.connect();
      } catch (error) {
        log.error('connection', `Reconnect failed:`, error);
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
  // Request/Response Handling
  // ==========================================================================

  /**
   * Send a request and wait for response
   */
  async sendRequest<Req = unknown, Resp = unknown>(
    action: NapCatAction,
    params?: Req
  ): Promise<NapCatResp<Resp>> {
    if (!this.isConnected()) {
      return failResp<Resp>()
    }

    const echo = generateEchoId();

    return new Promise<NapCatResp<Resp>>((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(echo);
        reject(new Error(`Request timeout: ${action}`));
      }, REQUEST_TIMEOUT);

      // Store pending request
      this.pendingRequests.set(echo, {
        resolve: resolve as (response: NapCatResp) => void,
        reject,
        timeout,
      });

      // Send request
      const request: NapCatReq<Req> = {
        action,
        params,
        echo,
      };

      try {
        this.ws?.send(JSON.stringify(request));
        log.debug('connection', `Sent request: ${action} (echo: ${echo})`);
      } catch (error) {
        this.pendingRequests.delete(echo);
        clearTimeout(timeout);
        reject(error);
      }
    });
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

    log.info('connection', `State changed: ${oldState} -> ${state}`);

    if (state === 'connected') {
      this.lastHeartbeatTime = Date.now();
    }

    this.emit('state-changed', { ...this.getStatus(), error });
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return {
      state: this.state,
      lastConnected: this.lastHeartbeatTime || undefined,
      lastAttempted: this.totalReconnectAttempts > 0 ? Date.now() : undefined,
      error: this.state === 'failed' ? 'Connection failed' : undefined,
      reconnectAttempts: this.totalReconnectAttempts > 0 ? this.totalReconnectAttempts : undefined,
    };
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
}

export async function failResp<T>(msg: string = ''): Promise<NapCatResp<T>> {
  return Promise.resolve({
    status: "failed",
    retcode: -1,
    msg
  });
}
