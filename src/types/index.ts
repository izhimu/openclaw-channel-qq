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
  | 'send_private_msg'
  | 'send_group_msg'
  | 'delete_msg'
  | 'get_msg'
  | 'get_login_info'
  | 'get_friend_list'
  | 'get_group_list'
  | 'get_group_member_info'
  | 'get_group_member_list'
  | 'set_essence_msg'
  | 'delete_essence_msg'
  | 'set_group_add_request'
  | 'set_group_card'
  | 'set_group_name'
  | 'set_group_admin'
  | 'set_group_kick'
  | 'set_group_ban'
  | 'set_group_whole_ban'
  | 'set_group_anonymous'
  | 'set_group_anonymous_ban'
  | 'send_group_sign'
  | 'delete_friend'
  | 'get_group_honor_info'
  | 'get_essence_msg_list'
  | 'check_url_safely'
  | 'get_word_slices'
  | '.handle_quick_operation';

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

// Message Events
export interface NapCatMessageEvent extends NapCatEvent {
  post_type: 'message';
  message_type: 'private' | 'group';
  sub_type?: string;
  message_id: number;
  user_id: number;
  message: NapCatMessageSegment[];
  raw_message: string;
  font?: number;
  sender: NapCatSender;
  to_me?: boolean;
  group_id?: number;
}

export interface NapCatMessageSentEvent {
  time: number;
  self_id: number;
  post_type: 'message_sent_type';
  message_type: 'group';
  sub_type: 'normal';
  message_id: number;
  group_id: number;
  user_id: number;
  message: NapCatMessageSegment[];
  raw_message: string;
  font?: number;
  sender: {
    user_id: number;
    nickname: string;
    card: string;
    sex: string;
    age: number;
    area: string;
    level: string;
    role: string;
    title: string;
  };
}

export interface NapCatPrivateMessageSentEvent {
  time: number;
  self_id: number;
  post_type: 'message_private_sent_type';
  message_type: 'private';
  sub_type: 'friend' | 'group' | 'other';
  message_id: number;
  user_id: number;
  message: NapCatMessageSegment[];
  raw_message: string;
  font?: number;
  sender: {
    user_id: number;
    nickname: string;
  };
  target_id?: number;
}

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

// Request Events
export interface NapCatRequestEvent extends NapCatEvent {
  post_type: 'request';
  request_type: 'friend' | 'group' | 'event';
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
  | NapCatVideoSegment
  | NapCatFileSegment
  | NapCatXmlSegment
  | NapCatJsonSegment
  | NapCardImageSegment
  | NapCatUnknownSegment;

export interface NapCatSegmentBase {
  type: string;
  data: Record<string, unknown>;
}

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

export interface NapCatVideoSegment {
  type: 'video';
  data: {
    file: string;
    url?: string;
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

export interface NapCatXmlSegment {
  type: 'xml';
  data: {
    data: string;
  };
}

export interface NapCatJsonSegment {
  type: 'json';
  data: {
    data: string;
  };
}

export interface NapCardImageSegment {
  type: 'cardimage';
  data: {
    file?: string;
    url?: string;
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
// WebSocket Message Types
// =============================================================================

export interface WebSocketMessage {
  type: 'request' | 'response' | 'event';
  data: NapCatRequest | NapCatResponse | NapCatEvent;
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
// Send Message Parameters
// =============================================================================

export interface SendPrivateMsgParams {
  user_id: number;
  message: NapCatMessageSegment[];
}

export interface SendGroupMsgParams {
  group_id: number;
  message: NapCatMessageSegment[];
}

// =============================================================================
// API Response Types
// =============================================================================

export interface SendMsgResponse {
  message_id: number;
}

export interface LoginInfo {
  user_id: number;
  nickname: string;
}

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
// Security Adapter Types
// =============================================================================

/**
 * DM policy for a peer
 */
export interface DmPolicy {
  /** Whether DMs are allowed */
  allow: boolean;
  /** Reason if DMs are not allowed */
  reason?: string;
}

/**
 * Security warning
 */
export interface SecurityWarning {
  /** Warning code */
  code: string;
  /** Warning message */
  message: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high';
}

/**
 * Security context for warnings
 */
export interface SecurityContext {
  accountId: string;
  chatType: 'direct' | 'group';
  chatId: string;
  senderId?: string;
}

// =============================================================================
// Directory Adapter Types
// =============================================================================

/**
 * Peer (friend) information
 */
export interface PeerInfo {
  /** User ID */
  id: string;
  /** Display name */
  name: string;
  /** Optional nickname */
  nickname?: string;
  /** Avatar URL */
  avatarUrl?: string;
}

/**
 * Group information
 */
export interface GroupInfo {
  /** Group ID */
  id: string;
  /** Group name */
  name: string;
  /** Member count */
  memberCount?: number;
  /** Maximum members */
  maxMembers?: number;
  /** Group owner ID */
  ownerId?: string;
}

/**
 * Group member information
 */
export interface GroupMemberInfo {
  /** User ID */
  id: string;
  /** Display name */
  name: string;
  /** Nickname in group */
  card?: string;
  /** Role in group */
  role?: 'owner' | 'admin' | 'member';
}

/**
 * Cache entry with TTL
 */
export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// =============================================================================
// Heartbeat Event Status
// =============================================================================

/**
 * Status included in heartbeat events
 */
export interface HeartbeatStatus {
  online: boolean;
  good: boolean;
}

/**
 * Heartbeat event structure
 */
export interface HeartbeatEvent extends NapCatMetaEvent {
  meta_event_type: 'heartbeat';
  status: HeartbeatStatus;
  interval: number;
}

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

/**
 * Parsed reply message information
 */
export interface ReplyMessageData {
  /** ID of the quoted message */
  replyMessageId: string;
  /** Nickname of the quoted message sender */
  quotedSenderNickname: string;
  /** Content of the quoted message */
  quotedMessage: string;
  /** Content of the reply text (after [CQ:reply]) */
  replyText: string;
}

/**
 * Result of parsing a reply message
 */
export interface ReplyMessageParseResult {
  /** True if this is a reply message */
  isReply: boolean;
  /** Parsed reply data (if isReply is true) */
  data?: ReplyMessageData;
}
