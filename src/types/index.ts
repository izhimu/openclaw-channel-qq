import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/core";

export interface QQAccount {
  accountId: string
  wsUrl: string;
  token?: string;
  accessToken?: string;
  enabled: boolean;
  markdownFormat: boolean;
  messageDirect: QQAllowConfig
  messageGroup: QQGroupConfig;
  messageGroupsCustom: Record<string, QQGroupConfig>;
}

export interface InboundMessage {
  targetId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  isGroup: boolean;
  groupId?: string;
  wasMentioned?: boolean;
  replyToId?: string;
  hasMedia?: boolean;
  media?: DispatchMessageMedia;
  authorization?: {
    isAuthorizedSender: boolean;
    denialReason?: string;
  };
}

export interface ProcessInboundParams {
  cfg: OpenClawConfig;
  account: QQAccount;
  runtime: PluginRuntime;
  msg: InboundMessage;
}

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
  | 'get_login_info'
  | 'get_friend_list'
  | 'get_group_list'
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

/**
 * NapCat 消息事件类型
 */
export interface NapCatMessageEvent extends NapCatEvent {
  post_type: "message";
  message_type: "group" | "private";
  message: NapCatMessage[];
  raw_message: string;
  user_id: number;
  group_id?: number;
  message_id?: number;
  time: number;
  sender?: {
    nickname?: string;
    card?: string;
  };
}

/**
 * NapCat 通知事件类型
 */
export interface NapCatNoticeEvent extends NapCatEvent {
  post_type: "notice";
  notice_type: "poke" | "notify";
  sub_type?: string;
  user_id: number;
  target_id: number;
  group_id?: number;
  time: number;
  raw_info?: Array<{ type: string; txt?: string }>;
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
  | NapCatUnknownSegment
  | NapCatVideoSegment;

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

export interface NapCatVideoSegment {
  type: 'video';
  data: {
    url: string;
    file_size?: string;
  };
}

export interface NapCatUnknownSegment {
  type: string;
  data: Record<string, unknown>;
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

export type OpenClawMessage =
  | OpenClawTextContent
  | OpenClawAtContent
  | OpenClawImageContent
  | OpenClawReplyContent
  | OpenClawAudioContent
  | OpenClawJsonContent
  | OpenClawFileContent
  | OpenClawVideoContent;

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
  path: string;
  url?: string;
  file: string;
  fileSize?: number;
}

export interface OpenClawJsonContent {
  type: 'json';
  data: string;
  prompt?: string;
}

export interface OpenClawFileContent {
  type: 'file';
  fileId?: string;
  file?: string;
  url?: string;
  fileSize?: number;
}

export interface OpenClawVideoContent {
  type: 'video';
  url?: string;
  fileSize?: number;
}

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

export interface GetStatusResp {
  online: boolean;
  good: boolean;
  stat: Record<any, any>;
}

export interface GetLoginInfoResp {
  user_id: number;
  nickname: string;
}

export interface GetFriendListResp {
  user_id: number;
  nickname: string;
}

export interface GetGroupListResp {
  group_id: number;
  group_name: string;
}

// =============================================================================
// Other Types
// =============================================================================

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
  targetId?: string;
}

export interface QQGroupConfig extends QQAllowConfig {
  requireMention: boolean;
  requirePoke: boolean;
  historyLimit: number;
  wakeWord?: string;
}

export interface QQAllowConfig {
  policy: "allow" | "deny" | "allowlist";
  allowFrom: string[];
  denyFrom: string[];
}

export type QQLoginInfo = {
  userId: string;
  nickname: string;
}

// =============================================================================
// Event Handler Types
// =============================================================================