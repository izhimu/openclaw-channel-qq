/**
 * Directory Adapter for QQ NapCat Plugin
 * Handles friend list, group list, and group member lookups
 */

import type {
  PeerInfo,
  GroupInfo,
  GroupMemberInfo,
  CacheEntry,
  NapCatResponse,
} from '../types/index.js';
import type { ChannelDirectoryEntry } from 'openclaw/plugin-sdk';
import { logWarn, logDebug } from '../utils/index.js';

const DEFAULT_CACHE_TTL = 30000; // 30 seconds

/**
 * Simple in-memory cache with TTL
 */
class DirectoryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttl: number;

  constructor(ttl: number = DEFAULT_CACHE_TTL) {
    this.ttl = ttl;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.ttl,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }
}

// Cache instances per account
const peerCacheMap = new Map<string, DirectoryCache<PeerInfo[]>>();
const groupCacheMap = new Map<string, DirectoryCache<GroupInfo[]>>();
const groupMemberCacheMap = new Map<string, DirectoryCache<GroupMemberInfo[]>>();

function getPeerCache(accountId: string): DirectoryCache<PeerInfo[]> {
  if (!peerCacheMap.has(accountId)) {
    peerCacheMap.set(accountId, new DirectoryCache<PeerInfo[]>());
  }
  return peerCacheMap.get(accountId)!;
}

function getGroupCache(accountId: string): DirectoryCache<GroupInfo[]> {
  if (!groupCacheMap.has(accountId)) {
    groupCacheMap.set(accountId, new DirectoryCache<GroupInfo[]>());
  }
  return groupCacheMap.get(accountId)!;
}

function getGroupMemberCache(accountId: string): DirectoryCache<GroupMemberInfo[]> {
  if (!groupMemberCacheMap.has(accountId)) {
    groupMemberCacheMap.set(accountId, new DirectoryCache<GroupMemberInfo[]>());
  }
  return groupMemberCacheMap.get(accountId)!;
}

/**
 * Connection interface for API calls
 */
interface Connection {
  sendRequest<T>(action: string, params?: Record<string, unknown>): Promise<NapCatResponse<T>>;
}

/**
 * Get self (bot) information
 */
export async function self(
  accountId: string,
  connection: Connection
): Promise<PeerInfo | null> {
  try {
    const response = await connection.sendRequest<{
      user_id: number;
      nickname: string;
    }>('get_login_info', {});

    if (response.status === 'ok' && response.data) {
      return {
        id: String(response.data.user_id),
        name: response.data.nickname,
        nickname: response.data.nickname,
      };
    }
    return null;
  } catch (error) {
    logWarn('directory', `Failed to get self info for account ${accountId}:`, error);
    return null;
  }
}

/**
 * List all peers (friends)
 */
export async function listPeers(
  accountId: string,
  connection: Connection,
  options: { forceRefresh?: boolean } = {}
): Promise<PeerInfo[]> {
  const cache = getPeerCache(accountId);

  // Check cache first
  if (!options.forceRefresh) {
    const cached = cache.get('peers');
    if (cached) {
      logDebug('directory', `Using cached peer list for account ${accountId}`);
      return cached;
    }
  }

  try {
    const response = await connection.sendRequest<
      Array<{
        user_id: number;
        nickname: string;
        remark?: string;
      }>
    >('get_friend_list', {});

    if (response.status === 'ok' && response.data) {
      const peers: PeerInfo[] = response.data.map((friend) => ({
        id: String(friend.user_id),
        name: friend.remark || friend.nickname,
        nickname: friend.nickname,
      }));

      // Update cache
      cache.set('peers', peers);
      return peers;
    }

    return [];
  } catch (error) {
    logWarn('directory', `Failed to list peers for account ${accountId}:`, error);
    return [];
  }
}

/**
 * List all groups
 */
export async function listGroups(
  accountId: string,
  connection: Connection,
  options: { forceRefresh?: boolean } = {}
): Promise<GroupInfo[]> {
  const cache = getGroupCache(accountId);

  // Check cache first
  if (!options.forceRefresh) {
    const cached = cache.get('groups');
    if (cached) {
      logDebug('directory', `Using cached group list for account ${accountId}`);
      return cached;
    }
  }

  try {
    const response = await connection.sendRequest<
      Array<{
        group_id: number;
        group_name: string;
        member_count?: number;
        max_member_count?: number;
      }>
    >('get_group_list', {});

    if (response.status === 'ok' && response.data) {
      const groups: GroupInfo[] = response.data.map((group) => ({
        id: String(group.group_id),
        name: group.group_name,
        memberCount: group.member_count,
        maxMembers: group.max_member_count,
      }));

      // Update cache
      cache.set('groups', groups);
      return groups;
    }

    return [];
  } catch (error) {
    logWarn('directory', `Failed to list groups for account ${accountId}:`, error);
    return [];
  }
}

/**
 * List members of a group
 */
export async function listGroupMembers(
  accountId: string,
  groupId: string,
  connection: Connection,
  options: { forceRefresh?: boolean } = {}
): Promise<GroupMemberInfo[]> {
  const cacheKey = `group:${groupId}`;
  const cache = getGroupMemberCache(accountId);

  // Check cache first
  if (!options.forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      logDebug('directory', `Using cached member list for group ${groupId}`);
      return cached;
    }
  }

  try {
    const response = await connection.sendRequest<
      Array<{
        user_id: number;
        nickname: string;
        card?: string;
        role?: 'owner' | 'admin' | 'member';
      }>
    >('get_group_member_list', {
      group_id: Number(groupId),
    });

    if (response.status === 'ok' && response.data) {
      const members: GroupMemberInfo[] = response.data.map((member) => ({
        id: String(member.user_id),
        name: member.nickname,
        card: member.card,
        role: member.role,
      }));

      // Update cache
      cache.set(cacheKey, members);
      return members;
    }

    return [];
  } catch (error) {
    logWarn('directory', `Failed to list group members for group ${groupId}:`, error);
    return [];
  }
}

/**
 * Find a peer by ID
 */
export async function findPeer(
  accountId: string,
  peerId: string,
  connection: Connection,
  options?: { forceRefresh?: boolean }
): Promise<PeerInfo | null> {
  const peers = await listPeers(accountId, connection, options);
  return peers.find((p) => p.id === peerId) || null;
}

/**
 * Find a group by ID
 */
export async function findGroup(
  accountId: string,
  groupId: string,
  connection: Connection,
  options?: { forceRefresh?: boolean }
): Promise<GroupInfo | null> {
  const groups = await listGroups(accountId, connection, options);
  return groups.find((g) => g.id === groupId) || null;
}

/**
 * Find a group member by ID
 */
export async function findGroupMember(
  accountId: string,
  groupId: string,
  memberId: string,
  connection: Connection,
  options?: { forceRefresh?: boolean }
): Promise<GroupMemberInfo | null> {
  const members = await listGroupMembers(accountId, groupId, connection, options);
  return members.find((m) => m.id === memberId) || null;
}

/**
 * Invalidate all caches for an account
 */
export function invalidateAccountCache(accountId: string): void {
  getPeerCache(accountId).clear();
  getGroupCache(accountId).clear();
  getGroupMemberCache(accountId).clear();
  logDebug('directory', `Invalidated all caches for account ${accountId}`);
}

/**
 * Convert PeerInfo to ChannelDirectoryEntry
 */
function peerToDirectoryEntry(peer: PeerInfo): ChannelDirectoryEntry {
  return {
    kind: 'user',
    id: peer.id,
    name: peer.name,
    handle: peer.nickname,
    raw: peer,
  };
}

/**
 * Convert GroupInfo to ChannelDirectoryEntry
 */
function groupToDirectoryEntry(group: GroupInfo): ChannelDirectoryEntry {
  return {
    kind: 'group',
    id: group.id,
    name: group.name,
    raw: group,
  };
}

/**
 * Convert GroupMemberInfo to ChannelDirectoryEntry
 */
function groupMemberToDirectoryEntry(member: GroupMemberInfo): ChannelDirectoryEntry {
  return {
    kind: 'user',
    id: member.id,
    name: member.name,
    raw: member,
  };
}

/**
 * Directory adapter factory
 * Creates a directory adapter for the plugin
 */
export function createDirectoryAdapter(options: {
  getConnection: (accountId: string) => Connection | undefined;
}) {
  const getConn = (accountId: string): Connection => {
    const conn = options.getConnection(accountId);
    if (!conn) {
      throw new Error(`Connection not found for account: ${accountId}`);
    }
    return conn;
  };

  return {
    /**
     * Get self (bot) information
     */
    self: async (params: { cfg?: unknown; accountId?: string | null; runtime?: unknown }): Promise<ChannelDirectoryEntry | null> => {
      const accountId = params.accountId || 'default';
      const result = await self(accountId, getConn(accountId));
      return result ? peerToDirectoryEntry(result) : null;
    },

    /**
     * List all peers (friends)
     */
    listPeers: async (params: { cfg?: unknown; accountId?: string | null; query?: string | null; limit?: number | null; runtime?: unknown }): Promise<ChannelDirectoryEntry[]> => {
      const accountId = params.accountId || 'default';
      const peers = await listPeers(accountId, getConn(accountId), {});

      // Apply filter if query provided
      let result = peers;
      if (params.query) {
        const queryLower = params.query.toLowerCase();
        result = peers.filter(p =>
          p.name?.toLowerCase().includes(queryLower) ||
          p.nickname?.toLowerCase().includes(queryLower) ||
          p.id.includes(queryLower)
        );
      }

      // Apply limit if provided
      if (params.limit && params.limit > 0) {
        result = result.slice(0, params.limit);
      }

      return result.map(peerToDirectoryEntry);
    },

    /**
     * List all groups
     */
    listGroups: async (params: { cfg?: unknown; accountId?: string | null; query?: string | null; limit?: number | null; runtime?: unknown }): Promise<ChannelDirectoryEntry[]> => {
      const accountId = params.accountId || 'default';
      const groups = await listGroups(accountId, getConn(accountId), {});

      // Apply filter if query provided
      let result = groups;
      if (params.query) {
        const queryLower = params.query.toLowerCase();
        result = groups.filter(g =>
          g.name?.toLowerCase().includes(queryLower) ||
          g.id.includes(queryLower)
        );
      }

      // Apply limit if provided
      if (params.limit && params.limit > 0) {
        result = result.slice(0, params.limit);
      }

      return result.map(groupToDirectoryEntry);
    },

    /**
     * List members of a group
     */
    listGroupMembers: async (params: { cfg?: unknown; accountId?: string | null; groupId: string; limit?: number | null; runtime?: unknown }): Promise<ChannelDirectoryEntry[]> => {
      const accountId = params.accountId || 'default';
      const members = await listGroupMembers(accountId, params.groupId, getConn(accountId), {});

      // Apply limit if provided
      let result = members;
      if (params.limit && params.limit > 0) {
        result = members.slice(0, params.limit);
      }

      return result.map(groupMemberToDirectoryEntry);
    },

    /**
     * Invalidate all caches for an account
     */
    invalidateAccountCache: (accountId: string) => invalidateAccountCache(accountId),
  };
}

export type DirectoryAdapter = ReturnType<typeof createDirectoryAdapter>;
