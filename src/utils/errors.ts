/**
 * Standard Error Types for OpenClaw Channel Plugin
 * Provides structured error handling with recovery information
 */

/**
 * Standard channel error interface
 * All errors returned by the plugin should conform to this format
 */
export interface ChannelError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Whether the error is recoverable (can be retried) */
  recoverable: boolean;
  /** Suggested retry delay in milliseconds (only for recoverable errors) */
  retryAfter?: number;
  /** Additional error context/data */
  details?: Record<string, unknown>;
}

/**
 * Error codes used throughout the plugin
 */
export const ErrorCodes = {
  // Connection errors
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  CONNECTION_CLOSED: 'CONNECTION_CLOSED',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_NOT_ESTABLISHED: 'CONNECTION_NOT_ESTABLISHED',
  HEARTBEAT_TIMEOUT: 'HEARTBEAT_TIMEOUT',
  MAX_RECONNECT_REACHED: 'MAX_RECONNECT_REACHED',

  // Request errors
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  REQUEST_FAILED: 'REQUEST_FAILED',
  INVALID_REQUEST: 'INVALID_REQUEST',

  // Message errors
  MESSAGE_SEND_FAILED: 'MESSAGE_SEND_FAILED',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  MESSAGE_RECALL_FAILED: 'MESSAGE_RECALL_FAILED',
  MESSAGE_RECALL_TIMEOUT: 'MESSAGE_RECALL_TIMEOUT',

  // Account errors
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_NOT_CONFIGURED: 'ACCOUNT_NOT_CONFIGURED',
  ACCOUNT_PROBE_FAILED: 'ACCOUNT_PROBE_FAILED',

  // Permission errors
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_GROUP_ADMIN: 'NOT_GROUP_ADMIN',

  // API errors
  API_ERROR: 'API_ERROR',
  API_RATE_LIMITED: 'API_RATE_LIMITED',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_TARGET: 'INVALID_TARGET',
  INVALID_MESSAGE_FORMAT: 'INVALID_MESSAGE_FORMAT',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Create a standard channel error
 */
export function createError(
  code: ErrorCode,
  message: string,
  options: {
    recoverable?: boolean;
    retryAfter?: number;
    details?: Record<string, unknown>;
  } = {}
): ChannelError {
  return {
    code,
    message,
    recoverable: options.recoverable ?? false,
    retryAfter: options.retryAfter,
    details: options.details,
  };
}

/**
 * Create a recoverable error (can be retried)
 */
export function createRecoverableError(
  code: ErrorCode,
  message: string,
  retryAfter?: number,
  details?: Record<string, unknown>
): ChannelError {
  return createError(code, message, {
    recoverable: true,
    retryAfter: retryAfter ?? 5000,
    details,
  });
}

/**
 * Create a non-recoverable error (should not be retried)
 */
export function createFatalError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ChannelError {
  return createError(code, message, {
    recoverable: false,
    details,
  });
}

/**
 * Convert an unknown error to a ChannelError
 */
export function toChannelError(error: unknown): ChannelError {
  if (isChannelError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return createError(ErrorCodes.API_ERROR, error.message, {
      recoverable: true,
      retryAfter: 5000,
    });
  }

  return createError(
    ErrorCodes.API_ERROR,
    String(error) || 'Unknown error',
    { recoverable: true, retryAfter: 5000 }
  );
}

/**
 * Type guard to check if an object is a ChannelError
 */
export function isChannelError(error: unknown): error is ChannelError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'recoverable' in error &&
    typeof (error as ChannelError).code === 'string' &&
    typeof (error as ChannelError).message === 'string' &&
    typeof (error as ChannelError).recoverable === 'boolean'
  );
}

/**
 * Common error factories for specific scenarios
 */
export const Errors = {
  connectionTimeout: (details?: Record<string, unknown>) =>
    createRecoverableError(
      ErrorCodes.CONNECTION_TIMEOUT,
      'Connection to NapCat timed out',
      10000,
      details
    ),

  connectionFailed: (reason: string, details?: Record<string, unknown>) =>
    createRecoverableError(
      ErrorCodes.CONNECTION_FAILED,
      `Connection failed: ${reason}`,
      5000,
      details
    ),

  requestTimeout: (action: string, details?: Record<string, unknown>) =>
    createRecoverableError(
      ErrorCodes.REQUEST_TIMEOUT,
      `Request timeout: ${action}`,
      5000,
      details
    ),

  requestFailed: (action: string, reason: string, details?: Record<string, unknown>) =>
    createError(
      ErrorCodes.REQUEST_FAILED,
      `Request failed: ${action} - ${reason}`,
      { recoverable: true, retryAfter: 3000, details }
    ),

  messageSendFailed: (reason: string, details?: Record<string, unknown>) =>
    createError(
      ErrorCodes.MESSAGE_SEND_FAILED,
      `Failed to send message: ${reason}`,
      { recoverable: true, retryAfter: 3000, details }
    ),

  messageRecallFailed: (reason: string, details?: Record<string, unknown>) =>
    createError(
      ErrorCodes.MESSAGE_RECALL_FAILED,
      `Failed to recall message: ${reason}`,
      { recoverable: false, details }
    ),

  messageRecallTimeout: (details?: Record<string, unknown>) =>
    createFatalError(
      ErrorCodes.MESSAGE_RECALL_TIMEOUT,
      'Message recall timeout - message may be too old to recall',
      details
    ),

  accountNotFound: (accountId: string) =>
    createFatalError(
      ErrorCodes.ACCOUNT_NOT_FOUND,
      `Account not found: ${accountId}`,
      { accountId }
    ),

  accountNotConfigured: (accountId: string) =>
    createFatalError(
      ErrorCodes.ACCOUNT_NOT_CONFIGURED,
      `Account not properly configured: ${accountId}`,
      { accountId }
    ),

  permissionDenied: (action: string, details?: Record<string, unknown>) =>
    createFatalError(
      ErrorCodes.PERMISSION_DENIED,
      `Permission denied: ${action}`,
      details
    ),

  invalidTarget: (target: string, details?: Record<string, unknown>) =>
    createFatalError(
      ErrorCodes.INVALID_TARGET,
      `Invalid message target: ${target}`,
      { target, ...details }
    ),
};
