/**
 * QQ Channel Native Commands Module
 * Handles text-based command parsing and execution for QQ
 */

import {
  clearHistoryEntries,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";
import { Logger as log } from "../utils/log.js";
import { unlink, access } from "fs/promises";
import { constants } from "fs";
import { join } from "path";
import { historyCache } from "./runtime.js";
import type { CommandResult, ParsedCommand } from "../types";

// =============================================================================
// Command Parsing
// =============================================================================

const COMMAND_PATTERN = /^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/;

/**
 * Parse command string
 * /new hello world -> { name: "new", args: "hello world" }
 */
export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  const match = trimmed.match(COMMAND_PATTERN);
  if (!match) {
    return null;
  }
  return {
    name: match[1].toLowerCase(),
    args: match[2]?.trim() || undefined,
  };
}

/**
 * Check if message should trigger command processing
 * Simply checks if the text starts with /
 */
export function shouldProcessCommands(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('/');
}

// =============================================================================
// Command Handlers
// =============================================================================

/**
 * Handle /new and /reset commands
 */
async function handleResetCommand(params: {
  sessionKey: string;
  storePath: string;
  tailText?: string;
}): Promise<CommandResult> {
  const { sessionKey, storePath, tailText } = params;

  log.info("commands", `Resetting session: ${sessionKey}`);

  // 1. Delete session history file
  const sessionFile = join(storePath, `${sessionKey}.jsonl`);
  try {
    await access(sessionFile, constants.F_OK);
    await unlink(sessionFile);
    log.info("commands", `Deleted session file: ${sessionFile}`);
  } catch (err) {
    // File not existing is normal
    log.debug("commands", `Session file not found or already deleted: ${sessionFile}`);
  }

  // 2. Clear history cache
  clearHistoryEntries({
    historyMap: historyCache,
    historyKey: sessionKey,
  });

  // 3. Build reply
  const reply = tailText?.trim()
    ? "✅ 会话已重置"
    : "✅ 会话已重置，开始新的对话吧！";

  // 4. If there's tailText, continue processing
  return {
    handled: true,
    shouldContinue: !!tailText?.trim(),
    reply,
    tailText: tailText?.trim() || undefined,
  };
}

/**
 * Handle /help command
 */
function handleHelpCommand(): CommandResult {
  const helpText = `📖 可用命令

【基础命令】
/new [消息] - 开始新会话
/help - 显示帮助信息

【状态命令】
/status - 显示会话状态
/whoami - 显示你的用户信息

【使用提示】
• 私聊直接输入命令即可
• 群聊需要 @机器人 后输入命令
• 示例：/new 你好`;

  return {
    handled: true,
    shouldContinue: false,
    reply: helpText,
  };
}

/**
 * Handle /status command
 */
function handleStatusCommand(params: {
  sessionKey: string;
  senderId: string;
}): CommandResult {
  const { sessionKey, senderId } = params;

  const statusText = `📊 会话状态

会话 ID: ${sessionKey}
用户 ID: ${senderId}
状态: 活跃`;

  return {
    handled: true,
    shouldContinue: false,
    reply: statusText,
  };
}

/**
 * Handle /whoami command
 */
function handleWhoamiCommand(params: {
  senderId: string;
  senderName?: string;
}): CommandResult {
  const { senderId, senderName } = params;

  const whoamiText = `👤 用户信息

用户 ID: ${senderId}
昵称: ${senderName || "未知"}`;

  return {
    handled: true,
    shouldContinue: false,
    reply: whoamiText,
  };
}

/**
 * Handle unknown command
 */
function handleUnknownCommand(commandName: string): CommandResult {
  return {
    handled: true,
    shouldContinue: false,
    reply: `❓ 未知命令: /${commandName}\n\n使用 /help 查看可用命令。`,
  };
}

// =============================================================================
// Main Entry
// =============================================================================

/**
 * Handle commands in QQ messages
 */
export async function handleQQCommands(params: {
  content: string;
  sessionKey: string;
  storePath: string;
  senderId: string;
  senderName?: string;
  cfg: OpenClawConfig;
}): Promise<CommandResult> {
  const { content, sessionKey, storePath, senderId, senderName } = params;

  // 1. Check if contains command tokens
  if (!shouldProcessCommands(content)) {
    return { handled: false, shouldContinue: true };
  }

  // 2. Parse command
  const parsed = parseCommand(content);
  if (!parsed) {
    return { handled: false, shouldContinue: true };
  }

  log.info("commands", `Processing command: /${parsed.name}`);

  // 3. Route to corresponding handler
  switch (parsed.name) {
    case "new":
      return handleResetCommand({
        sessionKey,
        storePath,
        tailText: parsed.args,
      });

    case "help":
      return handleHelpCommand();

    case "status":
      return handleStatusCommand({ sessionKey, senderId });

    case "whoami":
    case "id":
      return handleWhoamiCommand({ senderId, senderName });

    default:
      return handleUnknownCommand(parsed.name);
  }
}
