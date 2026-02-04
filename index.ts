/**
 * QQ NapCat Plugin Entry Point
 * Exports the plugin for OpenClaw to load
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { qqNapCatPlugin } from "./src/index.js";
import { setNapCatRuntime } from "./src/core/runtime.js";

const plugin = {
  id: "openclaw-channel-qq",
  name: "QQ NapCat",
  description: "QQ channel plugin for OpenClaw using NapCat WebSocket API",
  register(api: OpenClawPluginApi) {
    // Store PluginRuntime for access in gateway handlers
    setNapCatRuntime(api.runtime);
    api.registerChannel(qqNapCatPlugin);
  },
};

export default plugin;
