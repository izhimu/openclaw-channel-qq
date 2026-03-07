/**
 * Plugin Runtime Storage
 * Stores the PluginRuntime for access in gateway handlers
 */

import type { ChannelAccountSnapshot, ChannelGatewayContext, HistoryEntry, PluginRuntime } from "openclaw/plugin-sdk";
import { QQConfig, QQLoginInfo, QQSession } from "../types";
import { ConnectionManager } from "./connection.js";

// =============================================================================
// Runtime
// =============================================================================

let runtime: PluginRuntime | null = null;

export function setRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getRuntime(): PluginRuntime | null {
  return runtime;
}

// =============================================================================
// Context
// =============================================================================

let context: ChannelGatewayContext<QQConfig> | null = null;

export function setContext(next: ChannelGatewayContext<QQConfig>): void {
  context = next;
}

export function getContext(): ChannelGatewayContext<QQConfig> | null {
  return context;
}

export function clearContext(): void {
  context = null;
}

export function setContextStatus(next: Omit<ChannelAccountSnapshot, 'accountId'>): void {
  if (context) {
    context.setStatus({
      ...context.getStatus(),
      ...next,
    });
  }
}

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
// Session
// =============================================================================

const sessionMap = new Map<string, QQSession>()

export function getSession(sessionKey: string): QQSession {
  let session = sessionMap.get(sessionKey);
  if (session) {
    return session;
  }

  session = {};
  sessionMap.set(sessionKey, session);
  return session;
}

export function updateSession(sessionKey: string, session: QQSession): void {
  sessionMap.set(sessionKey, session);
}

export function clearSession(sessionKey: string): void {
  sessionMap.delete(sessionKey);
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