## 1. Project Setup

- [x] 1.1 Initialize TypeScript project with `package.json` and `tsconfig.json`
- [x] 1.2 Create `openclaw.plugin.json` manifest with plugin metadata and config schema
- [x] 1.3 Set up source directory structure (`src/index.ts`, `src/types.ts`, `src/connection.ts`, `src/adapters.ts`, `src/utils.ts`)
- [x] 1.4 Add `@types/node` and `ws` as development dependencies

## 2. Type Definitions

- [x] 2.1 Define NapCat API types (request/response format, action types, event types)
- [x] 2.2 Define NapCat message segment types (text, at, image, reply, face, poke, etc.)
- [x] 2.3 Define plugin config types (account config, WebSocket URL, access token)
- [x] 2.4 Define connection state types (connected, connecting, disconnected, failed)

## 3. Plugin Manifest

- [x] 3.1 Create plugin metadata (id: `qq-napcat`, name, description, version)
- [x] 3.2 Define `configSchema` for JSON Schema validation of channel config
- [x] 3.3 Add `uiHints` for sensitive fields (accessToken) and labels
- [x] 3.4 Define channel metadata in `openclaw.channel` section

## 4. WebSocket Connection Manager

- [x] 4.1 Implement `ConnectionManager` class to manage per-account WebSocket connections
- [x] 4.2 Implement connection establishment with authentication header support
- [x] 4.3 Implement WebSocket event handlers (open, message, error, close)
- [x] 4.4 Add connection state tracking per account
- [x] 4.5 Implement exponential backoff reconnection (1s → 30s max, 10 attempts)
- [x] 4.6 Add heartbeat timer (30s interval) with timeout detection (10s)
- [x] 4.7 Implement graceful shutdown (close all connections, cancel timers)

## 5. Message Type Adapters

- [x] 5.1 Implement text segment adapter (bidirectional)
- [x] 5.2 Implement at-mention segment adapter (send/receive, including @all)
- [x] 5.3 Implement image segment adapter (URL extraction/handling)
- [x] 5.4 Implement reply segment adapter (message threading)
- [x] 5.5 Implement face/emoji adapter (ID mapping to emoji)
- [x] 5.6 Implement poke/nudge event handler
- [x] 5.7 Add unknown message type fallback with warning logs
- [x] 5.8 Implement mixed segment message handling (preserve order)

## 6. Message Translation

- [x] 6.1 Implement OpenClaw → NapCat outbound message formatting
- [x] 6.2 Implement NapCat → OpenClaw inbound message parsing
- [x] 6.3 Convert NapCat integer message IDs to strings
- [x] 6.4 Generate unique IDs for messages missing message IDs
- [x] 6.5 Implement echo correlation for request/response matching

## 7. Channel Registration

- [x] 7.1 Implement `api.registerChannel()` with channel metadata (id: `qq`, label, etc.)
- [x] 7.2 Implement `config.listAccountIds` to enumerate configured accounts
- [x] 7.3 Implement `config.resolveAccount` to resolve account config
- [x] 7.4 Define `capabilities` (chatTypes: `direct`, `group`)

## 8. Outbound Message Handling

- [x] 8.1 Implement `outbound.sendText` for private messages (`send_private_msg`)
- [x] 8.2 Implement `outbound.sendText` for group messages (`send_group_msg`)
- [x] 8.3 Add error handling for disconnected WebSocket (return error, no retry)
- [x] 8.4 Return success/error response to OpenClaw after NapCat acknowledgment

## 9. Inbound Message Handling

- [x] 9.1 Register background service with `api.registerService()` for event listening
- [x] 9.2 Handle `message_private_sent_type` events (private messages)
- [x] 9.3 Handle `message_sent_type` events (group messages)
- [x] 9.4 Detect and flag at-mentions of the bot in group messages
- [x] 9.5 Dispatch translated messages to OpenClaw channel handler

## 10. Multi-Account Support

- [x] 10.1 Map incoming messages to correct account by sender/group ID
- [x] 10.2 Isolate connection failures per account (others continue operating)
- [x] 10.3 Implement per-account connection lifecycle (start/stop independently)

## 11. Status and Diagnostics

- [x] 11.1 Implement connection status reporting (connected/connecting/disconnected/failed)
- [x] 11.2 Add last connected timestamp tracking
- [x] 11.3 Include error details in status for failed connections
- [x] 11.4 Add logging for all connection state changes

## 12. Testing and Validation

- [ ] 12.1 Test WebSocket connection establishment and reconnection
- [ ] 12.2 Test private message send/receive
- [ ] 12.3 Test group message send/receive with @mentions
- [ ] 12.4 Test image message handling
- [ ] 12.5 Test multi-account configuration
- [ ] 12.6 Test graceful shutdown and restart
- [ ] 12.7 Test unknown message type handling
