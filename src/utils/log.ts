import type { RuntimeLogger } from "../types/index.js";
import { getQQRuntime } from "../core/runtime.js"

function log(): RuntimeLogger {
  return getQQRuntime().logging.getChildLogger();
}

function param(...args: unknown[]): string {
  return args.length > 0 ? ' ' + args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ') : '';
}

export class Logger {
  static debug(category: string, message: string, ...args: unknown[]): void {
    log().debug?.(`[qq:${category}] ${message}${param(args)}`);
  }

  static info(category: string, message: string, ...args: unknown[]): void {
    log().info?.(`[qq:${category}] ${message}${param(args)}`);
  }

  static warn(category: string, message: string, ...args: unknown[]): void {
    log().warn?.(`[qq:${category}] ${message}${param(args)}`);
  }

  static error(category: string, message: string, ...args: unknown[]): void {
    log().error?.(`[qq:${category}] ${message}${param(args)}`);
  }
}