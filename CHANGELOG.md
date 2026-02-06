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

## [1.0.1] - 2026-02-06

### Changed
- 重构日志系统以使用运行时日志接口
- 优化参数处理逻辑
- 更新日志记录以包含回复负载的JSON字符串
- 移除日志消息中的qq前缀

### Fixed
- 修复 OpenClawConfig 导入问题
- 更新所有QQ配置引用为"openclaw-channel-qq"以确保一致性
- 修复连接状态管理
- 调整消息派送的负载类型

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
