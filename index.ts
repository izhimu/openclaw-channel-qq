/**
 * QQ NapCat Plugin Entry Point
 * Exports the plugin for OpenClaw to load
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { qqPlugin } from "./src/channel.js";
import { setRuntime } from "./src/core/runtime.js";
import { CHANNEL_ID } from "./src/core/config.js";

const plugin = {
  id: CHANNEL_ID,
  name: "QQ",
  description: "QQ channel plugin for OpenClaw using NapCat WebSocket API",
  configSchema: emptyPluginConfigSchema,
  register(api: OpenClawPluginApi) {
    setRuntime(api.runtime);
    api.registerChannel({ plugin: qqPlugin });
  },
};

export default plugin;
