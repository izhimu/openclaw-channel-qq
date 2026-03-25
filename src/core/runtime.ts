/**
 * Plugin Runtime Storage
 * Stores the PluginRuntime for access in gateway handlers
 */

import type { HistoryEntry } from "openclaw/plugin-sdk/reply-history";
import { QQLoginInfo } from "../types";
import { ConnectionManager } from "./connection.js";

// =============================================================================
// 多账号连接管理
// =============================================================================

// 使用 Map 存储每个账号的连接
const connections = new Map<string, ConnectionManager>();

export function setConnection(accountId: string, conn: ConnectionManager): void {
  connections.set(accountId, conn);
}

export function getConnection(accountId?: string): ConnectionManager | null {
  if (!accountId) {
    // 返回第一个可用连接（兼容旧代码）
    const first = connections.values().next();
    return first.done ? null : first.value;
  }
  return connections.get(accountId) ?? null;
}

export function clearConnection(accountId: string): void {
  connections.delete(accountId);
}

export function getAllConnections(): Map<string, ConnectionManager> {
  return connections;
}

// =============================================================================
// 多账号登录信息
// =============================================================================

const loginInfos = new Map<string, QQLoginInfo>();

export function setLoginInfo(accountId: string, info: QQLoginInfo): void {
  loginInfos.set(accountId, info);
}

export function getLoginInfo(accountId?: string): QQLoginInfo {
  if (!accountId) {
    const first = loginInfos.values().next();
    return first.done ? { userId: '', nickname: '' } : first.value;
  }
  return loginInfos.get(accountId) ?? { userId: '', nickname: '' };
}

// =============================================================================
// History
// =============================================================================

export const historyCache = new Map<string, HistoryEntry[]>()