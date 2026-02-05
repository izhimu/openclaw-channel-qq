/**
 * QQ NapCat Plugin Entry Point
 * Exports the plugin for OpenClaw to load
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { qqPlugin } from "./src/channel.js";
import { setQQRuntime } from "./src/core/runtime.js";

const plugin = {
  id: "qq",
  name: "QQ NapCat",
  description: "QQ channel plugin for OpenClaw using NapCat WebSocket API",
  configSchema: emptyPluginConfigSchema,
  register(api: OpenClawPluginApi) {
    setQQRuntime(api.runtime);
    api.registerChannel({ plugin: qqPlugin });
  },
};

export default plugin;
