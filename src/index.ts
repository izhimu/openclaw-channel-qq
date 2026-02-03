/**
 * QQ NapCat Plugin for OpenClaw
 * Main plugin entry point
 */

// Type declarations for OpenClaw plugin API
import type {
  PluginAPI,
  ChannelDefinition,
  ServiceLifecycle,
  ChannelConfig,
} from './openclaw.js';

import {
  MultiConnectionManager,
  ConnectionManager,
} from './connection.js';
import {
  napCatToOpenClawMessage,
  openClawToNapCatMessage,
  getMessageSummary,
} from './adapters.js';
import {
  generateMessageId,
  messageIdToString,
  logDebug,
  logInfo,
  logWarn,
  logError,
  setLogLevel,
} from './utils.js';
import type {
  PluginConfig,
  AccountConfig,
  OpenClawMessage,
  NapCatEvent,
  NapCatMessageSentEvent,
  NapCatPrivateMessageSentEvent,
  NapCatPokeEvent,
  NapCatNoticeEvent,
  NapCatMetaEvent,
  ConnectionStatus,
} from './types.js';

// =============================================================================
// Plugin State
// =============================================================================

let api: PluginAPI;
let connectionManager: MultiConnectionManager;
let pluginConfig: PluginConfig | null = null;
let serviceLifecycle: ServiceLifecycle | null = null;
let channelHandler: ((message: OpenClawMessage) => void) | null = null;

// Bot user ID cache for routing
const botUserIds = new Map<string, number>();

// =============================================================================
// Plugin Initialization
// =============================================================================

export async function load(pluginApi: PluginAPI): Promise<void> {
  api = pluginApi;
  connectionManager = new MultiConnectionManager();

  // Set log level from debug mode
  if (api.config.debug) {
    setLogLevel(0); // DEBUG
  }

  logInfo('plugin', 'Loading QQ NapCat plugin...');

  // Register the channel
  await registerChannel();

  logInfo('plugin', 'QQ NapCat plugin loaded successfully');
}

export async function unload(): Promise<void> {
  logInfo('plugin', 'Unloading QQ NapCat plugin...');

  // Stop all connections
  if (connectionManager) {
    await connectionManager.stopAll();
  }

  // Stop the service
  if (serviceLifecycle) {
    await serviceLifecycle.stop();
    serviceLifecycle = null;
  }

  logInfo('plugin', 'QQ NapCat plugin unloaded');
}

// =============================================================================
// Channel Registration
// =============================================================================

async function registerChannel(): Promise<void> {
  const channelDefinition: ChannelDefinition = {
    id: 'qq',
    label: 'QQ (NapCat)',
    blurb: '通过 NapCat 连接 QQ 机器人',

    capabilities: {
      chatTypes: ['direct', 'group'],
    },

    config: {
      listAccountIds,
      resolveAccount,
    },

    outbound: {
      sendText,
    },
  };

  await api.channels.register(channelDefinition);

  logInfo('plugin', 'Channel registered: qq');
}

// =============================================================================
// Configuration
// =============================================================================

async function listAccountIds(): Promise<string[]> {
  const config = await loadConfig();
  if (!config) {
    return [];
  }

  return Object.keys(config.accounts).filter(
    accountId => config.accounts[accountId]?.enabled !== false
  );
}

async function resolveAccount(accountId: string): Promise<ChannelConfig | null> {
  const config = await loadConfig();
  if (!config || !config.accounts[accountId]) {
    return null;
  }

  const accountConfig = config.accounts[accountId];

  return {
    id: accountId,
    label: accountConfig.wsUrl,
    // Status will be populated by getStatus()
    status: await getConnectionStatus(accountId),
  };
}

async function loadConfig(): Promise<PluginConfig | null> {
  if (pluginConfig) {
    return pluginConfig;
  }

  try {
    const rawConfig = await api.config.get('channels.qq');
    if (!rawConfig || typeof rawConfig !== 'object') {
      logWarn('config', 'No QQ channel configuration found');
      return null;
    }

    pluginConfig = rawConfig as PluginConfig;

    // Set up connections for all accounts
    await setupConnections(pluginConfig);

    return pluginConfig;
  } catch (error) {
    logError('config', 'Failed to load configuration:', error);
    return null;
  }
}

async function setupConnections(config: PluginConfig): Promise<void> {
  const accountIds = Object.keys(config.accounts);

  logInfo('plugin', `Setting up connections for ${accountIds.length} account(s)`);

  for (const accountId of accountIds) {
    const accountConfig = config.accounts[accountId];

    // Skip disabled accounts
    if (accountConfig.enabled === false) {
      logDebug('plugin', `Account ${accountId} is disabled, skipping`);
      continue;
    }

    // Add connection
    const conn = connectionManager.addConnection(accountId, accountConfig);

    // Set up event handlers for this connection
    conn.on('event', handleNapCatEvent);
    conn.on('state-changed', handleConnectionStateChanged);
    conn.on('account-connected', handleAccountConnected);
    conn.on('account-failed', handleAccountFailed);

    // Start the connection
    await conn.start().catch(err => {
      logError('plugin', `Failed to start connection for ${accountId}:`, err);
    });
  }

  // Start the background service for listening to events
  await startEventService();
}

// =============================================================================
// Event Service (Background Service for Inbound Messages)
// =============================================================================

async function startEventService(): Promise<void> {
  if (serviceLifecycle) {
    return;
  }

  serviceLifecycle = await api.services.register({
    id: 'qq-napcat-event-listener',
    label: 'QQ NapCat Event Listener',

    async start() {
      logInfo('service', 'Event listener started');
      // Connections are already started in setupConnections
    },

    async stop() {
      logInfo('service', 'Event listener stopping');
      await connectionManager.stopAll();
    },
  });

  logInfo('service', 'Event listener service registered');
}

// =============================================================================
// Inbound Message Handling
// =============================================================================

async function handleNapCatEvent(accountId: string, event: NapCatEvent): Promise<void> {
  logDebug('events', `Received event: ${event.post_type}`);

  switch (event.post_type) {
    case 'message_sent_type':
      await handleGroupMessage(accountId, event as NapCatMessageSentEvent);
      break;

    case 'message_private_sent_type':
      await handlePrivateMessage(accountId, event as NapCatPrivateMessageSentEvent);
      break;

    case 'notice':
      await handleNoticeEvent(accountId, event);
      break;

    case 'meta_event':
      // Handle lifecycle events, heartbeat, etc.
      handleMetaEvent(accountId, event);
      break;

    default:
      logDebug('events', `Unhandled event type: ${event.post_type}`);
  }
}

async function handleGroupMessage(
  accountId: string,
  event: NapCatMessageSentEvent
): Promise<void> {
  const conn = connectionManager.getConnection(accountId);
  if (!conn) {
    return;
  }

  // Cache bot user ID for routing
  if (event.self_id && !botUserIds.has(accountId)) {
    botUserIds.set(accountId, event.self_id);
    conn.setBotUserId(event.self_id);
  }

  const botUserId = conn.getBotUserId();

  // Convert NapCat message to OpenClaw format
  const { content, isMention } = napCatToOpenClawMessage(event.message, botUserId);

  const message: OpenClawMessage = {
    id: messageIdToString(event.message_id),
    channelId: 'qq',
    accountId,
    chatId: String(event.group_id),
    chatType: 'group',
    content,
    senderId: String(event.user_id),
    senderName: event.sender?.nickname || event.sender?.card,
    timestamp: event.time * 1000, // Convert to milliseconds
    isMention,
  };

  logDebug('events', `Group message: ${getMessageSummary(event.message)}`);

  // Dispatch to OpenClaw
  dispatchMessage(message);
}

async function handlePrivateMessage(
  accountId: string,
  event: NapCatPrivateMessageSentEvent
): Promise<void> {
  const conn = connectionManager.getConnection(accountId);
  if (!conn) {
    return;
  }

  // Cache bot user ID for routing
  if (event.self_id && !botUserIds.has(accountId)) {
    botUserIds.set(accountId, event.self_id);
    conn.setBotUserId(event.self_id);
  }

  // Convert NapCat message to OpenClaw format
  const { content } = napCatToOpenClawMessage(event.message);

  const message: OpenClawMessage = {
    id: messageIdToString(event.message_id),
    channelId: 'qq',
    accountId,
    chatId: String(event.user_id),
    chatType: 'direct',
    content,
    senderId: String(event.user_id),
    senderName: event.sender?.nickname,
    timestamp: event.time * 1000,
  };

  logDebug('events', `Private message: ${getMessageSummary(event.message)}`);

  // Dispatch to OpenClaw
  dispatchMessage(message);
}

async function handleNoticeEvent(accountId: string, event: NapCatEvent): Promise<void> {
  const noticeEvent = event as NapCatNoticeEvent;

  if (noticeEvent.notice_type === 'poke') {
    await handlePokeEvent(accountId, noticeEvent as NapCatPokeEvent);
  } else {
    logDebug('events', `Notice event: ${noticeEvent.notice_type}`);
  }
}

async function handlePokeEvent(accountId: string, event: NapCatPokeEvent): Promise<void> {
  const conn = connectionManager.getConnection(accountId);
  if (!conn) {
    return;
  }

  const botUserId = conn.getBotUserId();

  // Only handle pokes directed at the bot
  if (botUserId && event.target_id !== botUserId) {
    return;
  }

  const message: OpenClawMessage = {
    id: generateMessageId(),
    channelId: 'qq',
    accountId,
    chatId: event.group_id ? String(event.group_id) : String(event.user_id),
    chatType: event.group_id ? 'group' : 'direct',
    content: [{
      type: 'text',
      text: `${event.sender_id} 戳了戳你`,
    }],
    senderId: String(event.user_id),
    timestamp: event.time * 1000,
  };

  logInfo('events', `Poke event from ${event.user_id}`);

  dispatchMessage(message);
}

function handleMetaEvent(accountId: string, event: NapCatEvent): void {
  // Handle heartbeat, lifecycle events
  logDebug('events', `Meta event: ${(event as NapCatMetaEvent).meta_event_type}`);
}

function dispatchMessage(message: OpenClawMessage): void {
  if (channelHandler) {
    channelHandler(message);
  } else {
    logWarn('events', 'No channel handler registered, message not dispatched');
  }
}

// =============================================================================
// Outbound Message Handling
// =============================================================================

async function sendText(
  accountId: string,
  chatId: string,
  chatType: 'direct' | 'group',
  content: unknown
): Promise<{ messageId: string } | { error: string }> {
  const conn = connectionManager.getConnection(accountId);

  if (!conn) {
    return { error: `No connection found for account: ${accountId}` };
  }

  if (!conn.isConnected()) {
    return { error: `Not connected for account: ${accountId}` };
  }

  try {
    // Convert OpenClaw content to NapCat message segments
    const messageSegments = openClawToNapCatMessage(content as OpenClawMessage['content']);

    let response;

    if (chatType === 'direct') {
      // Private message
      response = await conn.sendRequest('send_private_msg', {
        user_id: Number(chatId),
        message: messageSegments,
      });
    } else {
      // Group message
      response = await conn.sendRequest('send_group_msg', {
        group_id: Number(chatId),
        message: messageSegments,
      });
    }

    if (response.status === 'ok' && response.data) {
      const data = response.data as { message_id: number };
      return { messageId: messageIdToString(data.message_id) };
    } else {
      return { error: response.msg || 'Send failed' };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError('outbound', `Failed to send message: ${errorMessage}`);
    return { error: errorMessage };
  }
}

// =============================================================================
// Connection State Handlers
// =============================================================================

function handleConnectionStateChanged(status: ConnectionStatus): void {
  logInfo('connection', `Connection state changed: ${status.accountId} -> ${status.state}`);
  // Notify OpenClaw of status change if needed
}

function handleAccountConnected(accountId: string): void {
  logInfo('connection', `Account connected: ${accountId}`);
}

function handleAccountFailed(accountId: string): void {
  logError('connection', `Account failed: ${accountId}`);
}

// =============================================================================
// Status and Diagnostics
// =============================================================================

async function getConnectionStatus(accountId: string): Promise<string> {
  const conn = connectionManager.getConnection(accountId);

  if (!conn) {
    return 'not_configured';
  }

  const status = conn.getStatus();

  switch (status.state) {
    case 'connected':
      return 'connected';
    case 'connecting':
      return 'connecting';
    case 'disconnected':
      return 'disconnected';
    case 'failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

export async function getStatus(): Promise<Record<string, ConnectionStatus>> {
  const statuses: Record<string, ConnectionStatus> = {};

  for (const conn of connectionManager.getAllConnections()) {
    statuses[conn.getAccountId()] = conn.getStatus();
  }

  return statuses;
}

// =============================================================================
// Channel Handler Registration (called by OpenClaw)
// =============================================================================

export function onMessage(handler: (message: OpenClawMessage) => void): void {
  channelHandler = handler;
  logInfo('plugin', 'Channel handler registered');
}

// =============================================================================
// Plugin Metadata
// =============================================================================

export const name = 'qq-napcat';
export const version = '1.0.0';
export const description = 'QQ channel plugin for OpenClaw using NapCat WebSocket API';
