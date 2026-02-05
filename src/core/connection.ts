/**
 * WebSocket Connection Manager for NapCat
 * Handles per-account WebSocket connections with auto-reconnect and heartbeat
 */

import WebSocket from 'ws';
import EventEmitter from 'events';
import {
  NapCatRequest,
  NapCatResponse,
  NapCatEvent,
  NapCatMetaEvent,
  QQConfig,
  ConnectionState,
  ConnectionStatus,
  PendingRequest,
  HealthStatus, NapCatAction,
} from '../types/index.js';
import {
  Logger as log,
  generateEchoId,
  calculateBackoff,
  getCloseCodeMessage,
} from '../utils/index.js';

const MAX_RECONNECT_ATTEMPTS = -1;
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Connection Manager for a single NapCat account
 */
export class ConnectionManager extends EventEmitter {
  private config: QQConfig;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';

  // Heartbeat - active ping + OneBot 11 meta_event based
  private lastHeartbeatTime = 0;

  // Connection stats
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
    this.reconnectAttempts = 0;
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

    this.setState('connecting');

    try {
      // Build WebSocket URL with access_token query parameter (NapCat OneBot 11 standard)
      let wsUrl = this.config.wsUrl;
      if (this.config.accessToken) {
        const url = new URL(wsUrl);
        url.searchParams.set('access_token', this.config.accessToken);
        wsUrl = url.toString();
      }

      log.info('connection', `Connecting to ${wsUrl}`);

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
   * Close WebSocket connection
   */
  private async close(reason: string): Promise<void> {
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
    this.totalReconnectAttempts += this.reconnectAttempts;
    this.reconnectAttempts = 0;
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

  private handleResponse(response: NapCatResponse): void {
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

    if (MAX_RECONNECT_ATTEMPTS != -1 && this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      log.error('connection', `Max reconnect attempts reached`);
      this.setState('failed', 'Max reconnect attempts reached');
      this.emit('max-reconnect-attempts-reached');
      return;
    }

    const delayMs = calculateBackoff(this.reconnectAttempts);
    log.info('connection', `Scheduling reconnect in ${delayMs}ms (attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
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
  async sendRequest<T = unknown>(
    action: NapCatAction,
    params?: Record<string, unknown>
  ): Promise<NapCatResponse<T>> {
    if (!this.isConnected()) {
      throw new Error(`Not connected`);
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
      lastAttempted: this.reconnectAttempts > 0 ? Date.now() : undefined,
      error: this.state === 'failed' ? 'Connection failed' : undefined,
      reconnectAttempts: this.reconnectAttempts > 0 ? this.reconnectAttempts : undefined,
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

