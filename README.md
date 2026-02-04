# OpenClaw Channel Plugin - QQ (NapCat)

A QQ channel plugin for [OpenClaw](https://docs.openclaw.ai/) using the [NapCat](https://github.com/NapNeko/NapCatQQ) WebSocket API (OneBot 11 standard).

## Features

- **Multi-Account Support** - Connect and manage multiple QQ bot accounts simultaneously
- **Chat Types** - Supports both direct (private) and group messages
- **Message Types** - Text, @mentions, images, faces, and message replies
- **Typing Indicator** - Shows "typing..." status in private chats when bot is generating responses
- **Event Handling** - Message events, notice events (pokes), and meta events
- **Auto-Reconnect** - Automatic reconnection with exponential backoff
- **Heartbeat** - Keep-alive ping/pong for connection health monitoring
- **Interactive Setup** - CLI wizard for easy configuration
- **Control UI Support** - Native integration with OpenClaw's configuration UI

## Prerequisites

1. **OpenClaw** - Install [OpenClaw](https://docs.openclaw.ai/)
2. **NapCat** - Install [NapCat](https://github.com/NapNeko/NapCatQQ) and enable WebSocket forward

## Quick Start

### 1. Install Plugin

```bash
# Via OpenClaw CLI (recommended)
openclaw plugins install openclaw-channel-qq

# Or manually from local path
openclaw plugins install /path/to/openclaw-channel-qq
```

### 2. Configure NapCat

Enable WebSocket in NapCat's `config.yml`:

```yaml
ws:
  servers:
    - url: ws://0.0.0.0:3001
      token: ""  # Set if access control is needed
      enableHeart: true
```

### 3. Configure OpenClaw

Edit your OpenClaw config file:

```json
{
  "channels": {
    "openclaw-channel-qq": {
      "accounts": {
        "bot1": {
          "wsUrl": "ws://127.0.0.1:3001",
          "accessToken": "",
          "enabled": true
        }
      }
    }
  }
}
```

### 4. Restart Gateway

```bash
openclaw gateway restart
```

## Configuration

### Interactive Setup (Recommended)

```bash
openclaw onboard
```

Follow the prompts to configure your QQ bot account.

### Manual Configuration

Add to your OpenClaw config:

```json
{
  "channels": {
    "openclaw-channel-qq": {
      "accounts": {
        "bot1": {
          "wsUrl": "ws://127.0.0.1:3001",
          "accessToken": "",
          "enabled": true
        }
      }
    }
  }
}
```

Or multiple accounts:

```json
{
  "channels": {
    "openclaw-channel-qq": {
      "accounts": {
        "bot1": {
          "wsUrl": "ws://127.0.0.1:3001",
          "accessToken": "",
          "enabled": true
        },
        "bot2": {
          "wsUrl": "ws://127.0.0.1:3002",
          "accessToken": "your-token",
          "enabled": true
        }
      }
    }
  }
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wsUrl` | string | Yes | NapCat WebSocket URL |
| `accessToken` | string | No | Access token for authentication |
| `enabled` | boolean | No | Enable/disable account (default: true) |
| `name` | string | No | Display name for the account |

## Usage

### Sending Messages

```bash
# Via CLI
openclaw message send "Hello from OpenClaw!" --to openclaw-channel-qq:private:123456789
```

### Receiving Messages

The plugin automatically forwards incoming messages to OpenClaw's message handler.

**Supported Events:**
- `post_type: message` - Group and private messages
- `post_type: notice` - Notice events (pokes, etc.)

### Check Status

```bash
openclaw channels
```

## Message Format

### Inbound Message

```typescript
interface Message {
  id: string;
  channel: "openclaw-channel-qq";
  accountId: string;
  chatId: string;          // Group ID or user ID
  chatType: "direct" | "group";
  content: MessageSegment[];
  senderId: string;
  senderName?: string;
  timestamp: number;
  isMention?: boolean;
}
```

### Message Segments

```typescript
type MessageSegment =
  | { type: "text"; text: string }
  | { type: "at"; userId: string; isAll?: boolean }
  | { type: "image"; url: string }
  | { type: "reply"; messageId: string };
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## Project Structure

```
openclaw-channel-qq/
├── src/
│   ├── index.ts         # Main plugin definition
│   ├── core/
│   │   ├── connection.ts    # WebSocket connection manager
│   │   └── dispatch.ts      # Event dispatcher
│   ├── adapters/
│   │   └── message.ts       # NapCat ↔ OpenClaw message conversion
│   ├── core/
│   │   └── config.ts        # Configuration resolution
│   ├── onboarding.ts    # Interactive setup wizard
│   ├── types/
│   │   └── index.ts        # TypeScript definitions
│   └── utils/
│       ├── index.ts        # Utility functions
│       └── typing.ts       # Typing indicator utilities
├── docs/
│   ├── napcat-websocket-api.md  # NapCat API reference
│   └── plugin-development-guide.md
├── index.ts             # Plugin entry point
├── openclaw.plugin.json # Plugin manifest
└── package.json
```

## Troubleshooting

### Connection Issues

1. **Check NapCat is running** and WebSocket is enabled
2. **Verify the wsUrl** matches NapCat's configuration
3. **Check firewall** settings for the WebSocket port

### Messages Not Received

1. Ensure the account is `enabled: true`
2. Check OpenClaw logs: `openclaw logs`
3. Verify NapCat is sending events (check NapCat logs)

## Documentation

- [NapCat WebSocket API Reference](./docs/napcat-websocket-api.md) - Complete API documentation for NapCat integration
- [Plugin Development Guide](./docs/plugin-development-guide.md) - Guide for extending the plugin

## Links

- [OpenClaw Documentation](https://docs.openclaw.ai/)
- [OpenClaw Plugins](https://docs.openclaw.ai/plugin)
- [NapCat GitHub](https://github.com/NapNeko/NapCatQQ)
- [OneBot 11 Standard](https://github.com/botuniverse/onebot-11)

## License

MIT

## Author

izhimu
