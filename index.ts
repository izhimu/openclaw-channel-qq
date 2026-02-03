/**
 * QQ NapCat Plugin Entry Point
 * Exports the plugin for OpenClaw to load
 */

export { load, unload, onMessage, getStatus } from './src/index.js';
export { name, version, description } from './src/index.js';
