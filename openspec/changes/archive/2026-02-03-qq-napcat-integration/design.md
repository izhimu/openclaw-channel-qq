## Context

OpenClaw is an AI agent platform that supports multiple messaging channels (WhatsApp, Telegram, etc.) through a plugin system. This design adds QQ as a new channel via NapCat, a popular QQ bot framework that exposes a WebSocket API for third-party integrations.

**Current State:**
- OpenClaw Gateway loads plugins as in-process TypeScript modules via jiti
- Channel plugins implement the `api.registerChannel()` interface
- Each channel handles its own connection lifecycle and message translation
- Plugins declare their config schema in `openclaw.plugin.json`

**Constraints:**
- Must follow OpenClaw's plugin architecture (in-process, no external services)
- NapCat uses a specific WebSocket protocol with action-based requests
- QQ message types are more complex than simple text (at, reply, image, etc.)
- Need to support multiple QQ accounts simultaneously

## Goals / Non-Goals

**Goals:**
- Bidirectional WebSocket connection to NapCat with auto-reconnect
- Send and receive text messages for both private and group chats
- Support for @mentions in group messages
- Message reply threading support
- Image message handling (download inbound, upload outbound)
- Proper error handling and connection status reporting

**Non-Goals:**
- Voice/video messages (out of scope for MVP)
- File uploads (may add later)
- Rich QQ-specific features (dice, poker, music cards, etc.)
- Message history/fetching
- Group management (kick, ban, admin operations)

## Decisions

### 1. WebSocket Library Choice

**Decision:** Use native `WebSocket` API (Node.js `ws` as fallback)

**Rationale:**
- Node.js 18+ has native WebSocket support
- Native API is simpler and has no additional dependencies
- Fall back to `ws` package for older Node versions if needed

**Alternatives considered:**
- `socket.io`: Too heavyweight, requires matching server
- `eventsource`: Doesn't support bidirectional communication

### 2. Connection Architecture

**Decision:** One WebSocket connection per QQ account, managed by a singleton service

**Rationale:**
- Each NapCat instance serves one QQ account
- Centralized connection management enables heartbeat and reconnection logic
- Allows sharing connection state across the plugin

**Alternatives considered:**
- One connection per message: Too much overhead, connection churn
- Global single connection: Doesn't support multiple accounts

### 3. Message Translation Strategy

**Decision:** Explicit message type adapters with fallback to text

**Rationale:**
- QQ has many message types; we can't support all initially
- Adapter pattern allows incremental addition of new types
- Fallback ensures we don't crash on unknown types

**Alternatives considered:**
- Pass through all QQ types: Requires OpenClaw core changes
- Ignore unsupported types silently: User confusion

### 4. Event Handling Pattern

**Decision:** Register a background service that listens to WebSocket events and dispatches to OpenClaw

**Rationale:**
- OpenClaw's `api.registerService()` provides proper lifecycle (start/stop)
- Events can be processed asynchronously without blocking message sends
- Consistent with OpenClaw's plugin architecture

**NapCat Event Flow:**
```
NapCat → WebSocket → Event Listener → Message Adapter → OpenClaw Channel
```

### 5. Configuration Structure

**Decision:** Nested account structure under `channels.qq`

```typescript
{
  channels: {
    qq: {
      accounts: {
        "my-bot": {
          wsUrl: "ws://localhost:3001",
          accessToken: "optional-token",
          enabled: true
        }
      }
    }
  }
}
```

**Rationale:**
- Follows OpenClaw's pattern for multi-account channels
- Allows per-account WebSocket URLs (for distributed NapCat deployments)
- Access token support for secured NapCat instances

### 6. Error Handling Strategy

**Decision:** Graceful degradation with status reporting

**Rationale:**
- Network issues are inevitable; plugin shouldn't crash the Gateway
- Status reporting enables monitoring and debugging
- Reconnect with exponential backoff for transient failures

**Error Categories:**
- Connection failures: Log warning, schedule reconnect
- Message send failures: Return error to caller, don't retry
- Malformed events: Log and skip

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| NapCat WebSocket protocol changes | Pin to known NapCat version in docs, handle unknown messages gracefully |
| Connection drops during high volume | Implement message queuing with limits, exponential backoff reconnect |
| Memory leaks from event listeners | Proper cleanup on service stop, use WeakMap where appropriate |
| Large images cause memory issues | Add size limits, stream images where possible |
| QQ rate limiting | Implement send throttling, queue messages |

## Migration Plan

**Deployment Steps:**
1. Build plugin TypeScript to JavaScript
2. Install plugin via `openclaw plugins install` or add to `plugins.load.paths`
3. Configure `channels.qq.accounts.*` in OpenClaw config
4. Restart OpenClaw Gateway
5. Plugin auto-connects to NapCat on startup

**Rollback:**
- Disable plugin via `plugins.entries.qq-napcat.enabled = false`
- Restart Gateway
- No data migration required (plugin is stateless)

## Open Questions

1. **Message ID format:** NapCat uses integer message IDs, OpenClaw may expect strings. Decision: Convert to string for consistency.

2. **Group at-mention format:** Need to confirm OpenClaw's expected format for `@user` mentions. Will align with existing channels.

3. **Image storage:** NapCat returns image URLs; should we proxy or pass through? Decision: Pass through for MVP, consider proxying later for CORS.

4. **Heartbeat interval:** NapCat may have specific heartbeat requirements. Will use 30s default, make configurable.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            qq-napcat Plugin                          │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │   │
│  │  │   Plugin    │  │ Connection   │  │  Message    │  │   │
│  │  │  Register   │──│   Manager    │──│  Adapters   │  │   │
│  │  └─────────────┘  └──────────────┘  └─────────────┘  │   │
│  │                                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          │ WebSocket                         │
│                          ▼                                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      NapCat Instance                         │
│                    (QQ Bot Framework)                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                         QQ Servers                           │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
openclaw-plugin-napcat/
├── openclaw.plugin.json    # Plugin manifest
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts            # Plugin entry point, channel registration
    ├── connection.ts       # WebSocket connection manager
    ├── adapters.ts         # Message type adapters
    ├── types.ts            # TypeScript types for NapCat API
    └── utils.ts            # Helper functions
```
