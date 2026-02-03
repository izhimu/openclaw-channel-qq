/**
 * Plugin Runtime Storage
 * Stores the PluginRuntime for access in gateway handlers
 */

import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setNapCatRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getNapCatRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("NapCat runtime not initialized");
  }
  return runtime;
}
