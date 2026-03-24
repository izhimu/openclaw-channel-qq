import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setQQRuntime, getRuntime: getQQRuntime } =
  createPluginRuntimeStore<PluginRuntime>("QQ runtime not initialized");
export { getQQRuntime, setQQRuntime };
