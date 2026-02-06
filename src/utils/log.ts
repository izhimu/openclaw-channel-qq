import type { RuntimeLogger } from "../types/index.js";
import { getQQRuntime } from "../core/runtime.js"

function log(): RuntimeLogger {
  return getQQRuntime().logging.getChildLogger({ module: 'channel/qq' });
}

function param(args: unknown[]): string {
  if (args.length === 0) return '';
  return ' ' + args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
}

export class Logger {
  static debug(category: string, message: string, ...args: unknown[]): void {
    log().debug?.(`[${category}] ${message}${param(args)}`);
  }

  static info(category: string, message: string, ...args: unknown[]): void {
    log().info?.(`[${category}] ${message}${param(args)}`);
  }

  static warn(category: string, message: string, ...args: unknown[]): void {
    log().warn?.(`[${category}] ${message}${param(args)}`);
  }

  static error(category: string, message: string, ...args: unknown[]): void {
    log().error?.(`[${category}] ${message}${param(args)}`);
  }
}