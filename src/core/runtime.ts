/**
 * Plugin Runtime Storage
 * Stores the PluginRuntime for access in gateway handlers
 */

import type { ChannelAccountSnapshot, ChannelGatewayContext, PluginRuntime } from "openclaw/plugin-sdk";
import type { QQConfig } from "../types/index.js";
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