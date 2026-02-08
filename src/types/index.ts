/**
 * NapCat WebSocket API Types
 * Based on NapCat OneBot 11 implementation
 */

// =============================================================================
// NapCat API Request/Response Format
// =============================================================================

export interface NapCatReq<T = unknown> {
  action: NapCatAction;
  params?: T;
  echo?: string;
}

export interface NapCatResp<T = unknown> {
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
  | 'get_status'
  | 'get_file'
  | 'set_input_status';

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

// Meta Events
export interface NapCatMetaEvent extends NapCatEvent {
  post_type: 'meta_event';
  meta_event_type: 'lifecycle' | 'heartbeat';
  sub_type?: 'connect' | 'disconnect' | 'enable' | 'disable';
}

// =============================================================================
// NapCat Message Segment Types
// =============================================================================

export type NapCatMessage =
  | NapCatTextSegment
  | NapCatAtSegment
  | NapCatImageSegment
  | NapCatReplySegment
  | NapCatFaceSegment
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
// Plugin Config Types
// =============================================================================

export interface QQConfig {
  wsUrl: string;
  accessToken?: string;
  enabled: boolean;
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
  state: ConnectionState;
  lastConnected?: number;
  lastAttempted?: number;
  error?: string;
  reconnectAttempts?: number;
}

// =============================================================================
// OpenClaw Message Types (for integration)
// =============================================================================

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
  message?: string;
  senderId?: string;
  sender?: string;
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

export interface OpenClawFileContent {
  type: 'file';
  fileId?: string;
  file?: string;
  url?: string;
  fileSize?: number;
}

export type OpenClawMessage =
  | OpenClawTextContent
  | OpenClawAtContent
  | OpenClawImageContent
  | OpenClawReplyContent
  | OpenClawAudioContent
  | OpenClawJsonContent
  | OpenClawFileContent;

// =============================================================================
// API Response Types
// =============================================================================

// =============================================================================
// Utility Types
// =============================================================================

export interface PendingRequest {
  resolve: (response: NapCatResp) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// =============================================================================
// OpenClaw Plugin SDK Types (for adapters)
// =============================================================================

/**
 * Runtime logger interface from OpenClaw plugin-sdk
 * (Not exported from openclaw/package, defined locally)
 */
export interface RuntimeLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

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
 * Health status for connection
 */
export interface HealthStatus {
  healthy: boolean;
  lastHeartbeatAt: number;
  latencyMs?: number;
  consecutiveFailures: number;
}

/**
 * Sender information in get_msg response
 */
export interface GetMsgSender {
  user_id: number;
  nickname: string;
  card?: string;
}

// =============================================================================
// Request Types
// =============================================================================

export interface SendMsgReq {
  message_type: 'private' | 'group';
  user_id?: string
  group_id?: string;
  message: string | NapCatMessage[];
}

export interface SendMsgResp {
  message_id: number;
}

export interface GetMsgReq {
  message_id: number;
}

export interface GetMsgResp {
  self_id: number;
  user_id: string;
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
  message: string | NapCatMessage[];
  message_format: string;
  post_type: string;
  group_id?: number;
  emoji_likes_list?: unknown[];
}

export interface GetFileReq {
  file?: string;
  file_id?: string;
}

export interface GetFileResp {
  file?: string;
  url?: string;
  file_size?: string;
  file_name?: string;
  base64?: string;
}

export interface SetInputStatusReq {
  user_id: string;
  event_type: 0 | 1 | 2;
}

export interface DispatchMessageMedia {
  type?: string;
  path?: string;
  url?: string;
}

export interface DispatchMessageParams {
  chatType: 'direct' | 'group';
  chatId: string;
  senderId: string;
  senderName?: string;
  messageId: string;
  content: string;
  media?: DispatchMessageMedia;
  timestamp: number;
}