/**
 * NapCat WebSocket API Types
 * Based on NapCat OneBot 11 implementation
 */

// =============================================================================
// NapCat API Request/Response Format
// =============================================================================

export interface NapCatRequest {
  action: NapCatAction;
  params?: Record<string, unknown>;
  echo?: string;
}

export interface NapCatResponse<T = unknown> {
  status: 'ok' | 'failed';
  retcode: number;
  msg: string;
  data?: T;
  echo?: string;
}

// =============================================================================
// NapCat Action Types
// =============================================================================

export type NapCatAction =
  | 'send_msg'
  | 'get_msg'
  | 'get_status';

// =============================================================================
// NapCat Event Types
// =============================================================================

export interface NapCatEvent {
  time: number;
  self_id: number;
  post_type: NapCatPostType;
}

export type NapCatPostType =
  | 'message'
  | 'message_sent'
  | 'message_sent_type'
  | 'message_private_sent_type'
  | 'notice'
  | 'request'
  | 'meta_event';

// Notice Events
export interface NapCatNoticeEvent extends NapCatEvent {
  post_type: 'notice';
  notice_type: NapCatNoticeType;
}

export type NapCatNoticeType =
  | 'friend_add'
  | 'group_add'
  | 'group_delete'
  | 'group_admin'
  | 'group_ban'
  | 'group_increase'
  | 'group_decrease'
  | 'group_upload'
  | 'friend_recall'
  | 'group_recall'
  | 'notify'
  | 'poke'
  | 'lifecycle'
  | 'essence';

export interface NapCatPokeEvent extends NapCatNoticeEvent {
  notice_type: 'poke';
  user_id: number;
  target_id: number;
  group_id?: number;
  sender_id: number;
}

// Raw info item in notify events
export interface NapCatRawInfoItem {
  type: string;
  col?: string;
  nm?: string;
  uid?: string;
  jp?: string;
  src?: string;
  txt?: string;
  tp?: string;
}

export interface NapCatNotifyEvent extends NapCatNoticeEvent {
  notice_type: 'notify';
  sub_type: 'poke' | 'lucky_king' | 'honor' | string;
  user_id: number;
  target_id: number;
  group_id?: number;
  sender_id: number;
  raw_info?: NapCatRawInfoItem[];
}

// Meta Events
export interface NapCatMetaEvent extends NapCatEvent {
  post_type: 'meta_event';
  meta_event_type: 'lifecycle' | 'heartbeat';
  sub_type?: 'connect' | 'disconnect' | 'enable' | 'disable';
}

// =============================================================================
// NapCat Message Segment Types
// =============================================================================

export type NapCatMessageSegment =
  | NapCatTextSegment
  | NapCatAtSegment
  | NapCatImageSegment
  | NapCatReplySegment
  | NapCatFaceSegment
  | NapCatPokeSegment
  | NapCatRecordSegment
  | NapCatFileSegment
  | NapCatJsonSegment
  | NapCatUnknownSegment;

export interface NapCatTextSegment {
  type: 'text';
  data: {
    text: string;
  };
}

export interface NapCatAtSegment {
  type: 'at';
  data: {
    qq: string; // User ID or 'all' for @all
    name?: string;
  };
}

export interface NapCatImageSegment {
  type: 'image';
  data: {
    file: string;
    url?: string;
    type?: string;
    summary?: string;
  };
}

export interface NapCatReplySegment {
  type: 'reply';
  data: {
    id: string;
  };
}

export interface NapCatFaceSegment {
  type: 'face';
  data: {
    id: string;
  };
}

export interface NapCatPokeSegment {
  type: 'poke';
  data: {
    type?: string;
    id?: string;
    qq?: string;
  };
}

export interface NapCatRecordSegment {
  type: 'record';
  data: {
    file: string;
    path?: string;
    url?: string;
    file_size?: string;
  };
}

export interface NapCatFileSegment {
  type: 'file';
  data: {
    file: string;
    url?: string;
    file_id?: string;
    file_size?: string;
  };
}

export interface NapCatJsonSegment {
  type: 'json';
  data: {
    data: string;
  };
}

export interface NapCatUnknownSegment {
  type: string;
  data: Record<string, unknown>;
}

// =============================================================================
// Sender Information
// =============================================================================

export interface NapCatSender {
  user_id: number;
  nickname: string;
  card?: string;
  sex?: 'male' | 'female' | 'unknown';
  age?: number;
  area?: string;
  level?: string;
  role?: 'owner' | 'admin' | 'member';
  title?: string;
}

// =============================================================================
// Plugin Config Types
// =============================================================================

export interface PluginConfig {
  accounts: Record<string, AccountConfig>;
}

export interface AccountConfig {
  accountId: string;
  name?: string;
  wsUrl: string;
  accessToken?: string;
  enabled?: boolean;
  botUserId?: number;
}

// =============================================================================
// Connection State Types
// =============================================================================

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'failed';

export interface ConnectionStatus {
  accountId: string;
  state: ConnectionState;
  lastConnected?: number;
  lastAttempted?: number;
  error?: string;
  reconnectAttempts?: number;
}

// =============================================================================
// OpenClaw Message Types (for integration)
// =============================================================================

export interface OpenClawMessage {
  id: string;
  channelId: string;
  accountId: string;
  chatId: string;
  chatType: 'direct' | 'group';
  content: OpenClawMessageContent[];
  senderId: string;
  senderName?: string;
  timestamp: number;
  isMention?: boolean;
  replyTo?: string;
}

export interface OpenClawTextContent {
  type: 'text';
  text: string;
}

export interface OpenClawAtContent {
  type: 'at';
  userId: string;
  isAll?: boolean;
}

export interface OpenClawImageContent {
  type: 'image';
  url: string;
  /** Optional summary/description (e.g., "[动画表情]" for animated stickers) */
  summary?: string;
}

export interface OpenClawReplyContent {
  type: 'reply';
  messageId: string;
}

export interface OpenClawAudioContent {
  type: 'audio';
  /** Local file path to the audio file */
  path: string;
  /** Optional URL for downloading the audio */
  url?: string;
  /** File name */
  file: string;
  /** File size in bytes */
  fileSize?: number;
}

export interface OpenClawJsonContent {
  type: 'json';
  /** Raw JSON data string */
  data: string;
  /** Optional display text/prompt from the JSON */
  prompt?: string;
}

export type OpenClawMessageContent =
  | OpenClawTextContent
  | OpenClawAtContent
  | OpenClawImageContent
  | OpenClawReplyContent
  | OpenClawAudioContent
  | OpenClawJsonContent;

// =============================================================================
// API Response Types
// =============================================================================

// =============================================================================
// Utility Types
// =============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface PendingRequest {
  resolve: (response: NapCatResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// =============================================================================
// OpenClaw Plugin SDK Types (for adapters)
// =============================================================================

/**
 * Standard outbound delivery result
 */
export interface OutboundDeliveryResult {
  /** Channel identifier */
  channel: string;
  /** Message ID returned by the channel */
  messageId: string;
  /** Error if delivery failed */
  error?: Error;
  /** Timestamp of delivery */
  deliveredAt?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Channel gateway context passed to startAccount/stopAccount
 */
export interface ChannelGatewayContext<TAccountConfig> {
  /** Account configuration */
  account: TAccountConfig;
  /** Full configuration */
  cfg: unknown;
  /** Logger instance */
  log?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
  /** Get current runtime status */
  getStatus: () => ChannelRuntimeStatus;
  /** Set runtime status */
  setStatus: (status: ChannelRuntimeStatus) => void;
}

/**
 * Runtime status for a channel account
 */
export interface ChannelRuntimeStatus {
  accountId: string;
  running: boolean;
  connected: boolean;
  healthy?: boolean;
  lastConnectedAt: number | null;
  lastError: string | null;
  uptime?: number;
  reconnectCount?: number;
}

/**
 * Health status for connection
 */
export interface HealthStatus {
  healthy: boolean;
  lastHeartbeatAt: number;
  latencyMs?: number;
  consecutiveFailures: number;
}

// =============================================================================
// Directory Adapter Types
// =============================================================================

// =============================================================================
// Heartbeat Event Status
// =============================================================================

// =============================================================================
// get_msg API Response Types
// =============================================================================

/**
 * Sender information in get_msg response
 */
export interface GetMsgSender {
  user_id: number;
  nickname: string;
  card?: string;
}

/**
 * Data returned by get_msg API
 */
export interface GetMsgData {
  self_id: number;
  user_id: number;
  time: number;
  message_id: number;
  message_seq: number;
  real_id: number;
  real_seq: string;
  message_type: 'private' | 'group';
  sender: GetMsgSender;
  raw_message: string;
  font: number;
  sub_type?: string;
  message: string | NapCatMessageSegment[];
  message_format: string;
  post_type: string;
  group_id?: number;
  emoji_likes_list?: unknown[];
}

/**
 * Full response from get_msg API
 */
export interface GetMsgResponse {
  status: 'ok' | 'failed';
  retcode: number;
  data: GetMsgData;
  message: string;
  wording: string;
  echo?: string;
  stream?: string;
}
