# OpenClaw Plugin - QQ NapCat

A QQ channel plugin for [OpenClaw](https://github.com/openclaw) using the [NapCat](https://github.com/NapNeko/NapCatQQ) WebSocket API.

## Features

- **Multi-Account Support** - Connect and manage multiple QQ bot accounts simultaneously
- **Chat Types** - Supports both direct (private) and group messages
- **Message Types** - Text, @mentions, images, and message replies
- **Event Handling** - Message events, notice events (pokes), and meta events
- **Status Reporting** - Real-time connection status monitoring
- **WebSocket Communication** - Efficient real-time communication via NapCat WebSocket API

## Installation

### Method 1: openclaw plugins install (Recommended)

After publishing to npm, you can install directly:

```bash
openclaw plugins install qq-napcat
```

### Method 2: Local Development (For testing)

1. Clone this repository:

```bash
git clone https://github.com/izhimu/openclaw-plugin-napcat.git
cd openclaw-plugin-napcat
```

2. Install dependencies and build:

```bash
npm install
npm run build
```

3. Copy the plugin to OpenClaw's plugins directory:

```bash
# Assuming OpenClaw is installed at /path/to/openclaw
cp -r dist /path/to/openclaw/plugins/qq-napcat
cp openclaw.plugin.json /path/to/openclaw/plugins/qq-napcat/
cp package.json /path/to/openclaw/plugins/qq-napcat/
```

### Method 2: npm Install (For production)

1. Install the plugin:

```bash
cd /path/to/openclaw
npm install openclaw-channel-qq
```

2. The plugin will be available in `node_modules/openclaw-channel-qq`

### Register the Plugin in OpenClaw

Add the plugin to OpenClaw's plugin configuration (usually in `config.json` or plugins section):

```json
{
  "plugins": [
    {
      "id": "qq-napcat",
      "path": "./plugins/qq-napcat"
    }
  ]
}
```

Or if using npm install:

```json
{
  "plugins": [
    {
      "id": "qq-napcat",
      "module": "openclaw-channel-qq"
    }
  ]
}
```

### Configure QQ Accounts

Configure the plugin in your OpenClaw configuration file:

```json
{
  "channels": {
    "openclaw-channel-qq": {
      "accounts": {
        "bot1": {
          "wsUrl": "ws://127.0.0.1:3001",
          "accessToken": "optional-token",
          "enabled": true
        }
      }
    }
  }
}
```

## Configuration

### Account Configuration

Each account requires the following properties:

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `wsUrl` | string | Yes | - | NapCat WebSocket URL (e.g., `ws://127.0.0.1:3001`) |
| `accessToken` | string | No | - | Access token for authentication (if enabled) |
| `enabled` | boolean | No | `true` | Enable or disable this account |

### NapCat Setup

Before using this plugin, you need to set up NapCat:

1. Install [NapCat](https://github.com/NapNeko/NapCatQQ) following their documentation
2. Configure the WebSocket forward in NapCat's `config.json`:
   ```json
   {
     "ws": {
       "servers": [
         {
           "url": "ws://0.0.0.0:3001",
           "token": "",
           "enableHeart": true
         }
       ]
     }
   }
   ```

## Usage

### Sending Messages

```typescript
// Send to a group
await api.channels.sendText('bot1', '123456789', 'group', [
  { type: 'text', text: 'Hello, group!' }
]);

// Send to a private chat
await api.channels.sendText('bot1', '987654321', 'direct', [
  { type: 'text', text: 'Hello there!' }
]);
```

### Receiving Messages

The plugin automatically forwards incoming messages to OpenClaw's message handler. Messages include:

- Group messages (`message_sent_type`)
- Private messages (`message_private_sent_type`)
- Notice events (e.g., pokes)

### Connection Status

Monitor connection status for each account:

```typescript
import { getStatus } from 'qq-napcat';

const statuses = await getStatus();
console.log(statuses);
// { "bot1": { state: "connected", ... } }
```

## Message Format

### Inbound Message

```typescript
interface OpenClawMessage {
  id: string;              // Unique message ID
  channelId: 'qq';         // Channel identifier
  accountId: string;       // Account identifier (e.g., "bot1")
  chatId: string;          // Group ID or user ID
  chatType: 'direct' | 'group';
  content: MessageSegment[];
  senderId: string;
  senderName?: string;
  timestamp: number;
  isMention?: boolean;
}
```

### Message Segment

```typescript
type MessageSegment =
  | { type: 'text'; text: string }
  | { type: 'at'; qq: number }
  | { type: 'image'; file: string }
  | { type: 'reply'; id: number };
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Watch mode for development
npm run dev
```

## Project Structure

```
openclaw-plugin-napcat/
├── src/
│   ├── index.ts          # Main plugin entry point
│   ├── connection.ts     # WebSocket connection management
│   ├── adapters.ts       # Message format adapters
│   ├── types.ts          # TypeScript type definitions
│   ├── utils.ts          # Utility functions
│   └── openclaw.d.ts     # OpenClaw API type declarations
├── index.ts              # Plugin exports
├── openclaw.plugin.json  # Plugin manifest
├── package.json
└── tsconfig.json
```

## License

MIT

## Author

izhimu

## Links

- [OpenClaw](https://github.com/openclaw)
- [NapCat](https://github.com/NapNeko/NapCatQQ)
