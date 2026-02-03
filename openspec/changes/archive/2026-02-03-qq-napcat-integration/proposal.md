## Why

OpenClaw currently lacks integration with QQ, one of the most popular instant messaging platforms in China with over 800 million monthly active users. This plugin enables OpenClaw users to interact with QQ contacts and groups through the NapCat WebSocket API, filling a significant gap in OpenClaw's channel coverage.

## What Changes

- **New Channel Plugin**: Create a full-featured OpenClaw channel plugin for QQ via NapCat
  - WebSocket-based bidirectional communication with NapCat instances
  - Support for private messages (1-on-1 chat)
  - Support for group messages
  - Message type handling (text, images, at mentions, replies)

- **Plugin Registration**: Implement channel plugin following OpenClaw's plugin API
  - Register as `qq` or `napcat` channel
  - Config schema for NapCat WebSocket connection settings
  - Account configuration support for multiple QQ instances

- **Message Translation**: Convert between OpenClaw's message format and NapCat's message format
  - Outbound: OpenClaw format → NapCat `send_msg` action format
  - Inbound: NapCat event format → OpenClaw message format

## Capabilities

### New Capabilities
- `qq-messaging`: Core QQ message sending and receiving via NapCat WebSocket API
- `qq-websocket-connection`: WebSocket connection lifecycle management (connect, reconnect, heartbeat)
- `qq-message-types`: Support for text, image, at, reply, and other QQ message types

### Modified Capabilities
- None (this is a new channel integration)

## Impact

- **Code**: New plugin entry point `src/index.ts` with `openclaw.plugin.json` manifest
- **Dependencies**: `ws` or native WebSocket for NapCat connection; `openclaw/plugin-sdk` types
- **Configuration**: New config section `channels.qq.accounts.*` for NapCat connection settings (wsUrl, accessToken, etc.)
- **Systems**: OpenClaw Gateway will load this plugin as an in-process extension
