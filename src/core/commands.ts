/**
 * QQ Channel Native Commands Module
 * Provides command whitelist filtering for QQ channel
 *
 * All command processing is delegated to OpenClaw's native handleCommands.
 * This module only handles whitelist filtering before passing commands to the native system.
 */

// =============================================================================
// Command Whitelist
// =============================================================================

/**
 * Commands allowed in QQ channel context
 * Excludes sensitive commands like /bash, /config, /restart for security reasons
 */
export const QQ_ALLOWED_COMMANDS = new Set([
  // Basic commands
  "/new", "/reset", "/help", "/status", "/whoami", "/commands", "/id",
  // Session control
  "/stop", "/compact", "/session",
  // Model/output
  "/model", "/models", "/think", "/verbose", "/fast", "/usage",
  // Optional
  "/activation", "/send", "/context",
  // Aliases
  "/t", "/v", "/thinking", "/reasoning", "/reason",
]);

// =============================================================================
// Command Detection Helpers
// =============================================================================

/**
 * Check if message should trigger command processing
 * Simply checks if the text starts with /
 */
export function shouldProcessCommands(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('/');
}

/**
 * Check if the command is in the QQ whitelist
 * Only returns true if the message STARTS with a whitelisted command
 * @param text - Raw message text that may contain a command
 * @returns true if the message starts with an allowed command
 */
export function isAllowedQQCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();

  // Must start with /
  if (!trimmed.startsWith('/')) return false;

  // Extract command name (first word after /)
  const commandMatch = trimmed.match(/^\/([a-zA-Z0-9_-]+)/);
  if (!commandMatch) return false;

  return QQ_ALLOWED_COMMANDS.has(`/${commandMatch[1]}`);
}
