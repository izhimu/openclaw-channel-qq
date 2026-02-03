/**
 * QQ NapCat Plugin Entry Point
 * Exports the plugin for OpenClaw to load
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { qqNapCatPlugin } from "./src/index.js";

const plugin = {
  id: "openclaw-channel-qq",
  name: "QQ NapCat",
  description: "QQ channel plugin for OpenClaw using NapCat WebSocket API",
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: qqNapCatPlugin });
  },
};

export default plugin;
