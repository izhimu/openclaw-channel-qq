import type { RuntimeLogger } from "../types";
import { DEBUG_MODE } from "../core/config"
import { getRuntime } from "../core/runtime.js"

function log(): RuntimeLogger {
  return getRuntime()?.logging.getChildLogger({ module: 'channel/qq' }) ?? console;
}

function param(args: unknown[]): string {
  if (args.length === 0) return '';
  return ' ' + args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
}

export class Logger {
  static debug(category: string, message: string, ...args: unknown[]): void {
    if (DEBUG_MODE) {
      log().debug?.(`[${category}] ${message}${param(args)}`);
    }
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