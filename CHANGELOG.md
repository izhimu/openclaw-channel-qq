# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-04

### Added
- Typing indicator support for private messages
  - Displays "typing..." status when bot is generating responses
  - Uses NapCat's `set_input_status` API
  - Status automatically resets after 5 seconds
- NapCat WebSocket API documentation (`docs/napcat-websocket-api.md`)
  - Complete API reference for all NapCat actions
  - Message segment types documentation
  - Event handling reference
- Control UI support via `configSchema`

### Changed
- Simplified plugin label from "QQ (NapCat)" to "QQ"
- Simplified configuration schema to empty object for flexibility

## [1.0.0] - 2026-02-03

### Added
- Initial release of QQ NapCat plugin for OpenClaw
- NapCat WebSocket API integration
- Multi-account support
- Group message handling (`message_sent_type`)
- Private message handling (`message_private_sent_type`)
- Notice event handling (poke events)
- Message type support:
  - Text messages
  - @mentions
  - Images
  - Message replies
- Outbound message sending (group and private)
- Connection status reporting
- Auto-reconnection on WebSocket disconnect
- Configuration schema with UI hints
- Support for `openclaw plugins install` command
