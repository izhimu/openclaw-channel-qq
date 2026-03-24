/**
 * Plugin Runtime Storage
 * Stores the PluginRuntime for access in gateway handlers
 */

import type { HistoryEntry } from "openclaw/plugin-sdk/reply-history";
import { QQLoginInfo } from "../types";
import { ConnectionManager } from "./connection.js";

// =============================================================================
// Connection
// =============================================================================

let connection: ConnectionManager | null = null;

export function setConnection(next: ConnectionManager): void {
  connection = next;
}

export function getConnection(): ConnectionManager | null {
  return connection;
}

export function clearConnection(): void {
  connection = null;
}

// =============================================================================
// LoginInfo
// =============================================================================

const loginInfo: QQLoginInfo = {
  userId: '',
  nickname: '',
}

export function setLoginInfo(next: QQLoginInfo): void {
  Object.assign(loginInfo, next);
}

export function getLoginInfo(): QQLoginInfo {
  return loginInfo;
}

// =============================================================================
// History
// =============================================================================

export const historyCache = new Map<string, HistoryEntry[]>()