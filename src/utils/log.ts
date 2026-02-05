export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  static level = LogLevel.INFO;

  static setLevel(level: LogLevel): void {
    this.level = level;
  }

  static debug(category: string, message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(`[qq:${category}] ${message}`, ...args);
    }
  }

  static info(category: string, message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(`[qq:${category}] ${message}`, ...args);
    }
  }

  static warn(category: string, message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[qq:${category}] ${message}`, ...args);
    }
  }

  static error(category: string, message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[qq:${category}] ${message}`, ...args);
    }
  }
}