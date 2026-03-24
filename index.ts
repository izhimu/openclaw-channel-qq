import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { qqPlugin } from "./src/channel";
import { setQQRuntime } from "./src/runtime"

export default defineChannelPluginEntry({
  id: "qq",
  name: "QQ",
  description: "QQ Chat channel plugin",
  plugin: qqPlugin,
  setRuntime: setQQRuntime,
});