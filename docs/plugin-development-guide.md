# OpenClaw Plugin Development Guide

## Table of Contents

1. [Overview](#overview)
2. [Development Environment Setup](#development-environment-setup)
3. [Plugin Types](#plugin-types)
4. [Channel Plugin Development](#channel-plugin-development)
   - [Plugin Structure](#plugin-structure)
   - [Channel Plugin Interface](#channel-plugin-interface)
   - [Adapters Reference](#adapters-reference)
   - [Configuration Schema](#configuration-schema)
   - [Full-Duplex Communication](#full-duplex-communication)
   - [Multi-modal Support](#multi-modal-support)
5. [Available APIs and SDK](#available-apis-and-sdk)
6. [Complete Examples](#complete-examples)
7. [Testing](#testing)
8. [Publishing](#publishing)

---

## Overview

OpenClaw plugins allow you to extend the platform's capabilities by adding new messaging channels, AI providers, tools, services, and custom commands. This guide focuses on **Channel Plugin** development with detailed coverage of full-duplex and multi-modal chat interactions.

### Key Concepts

- **Channel Plugin**: Integrates a messaging platform (Telegram, Discord, custom service, etc.)
- **Provider Plugin**: Adds AI model providers (OpenAI, Anthropic, custom, etc.)
- **Service Plugin**: Background processes that run alongside the gateway
- **Tool Plugin**: Agent-accessible tools for specific capabilities
- **Command Plugin**: Custom slash commands that bypass the LLM

---

## Development Environment Setup

### Prerequisites

```bash
# Node.js 22+ required
node --version

# Install pnpm (preferred)
npm install -g pnpm

# Clone OpenClaw repository
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
```

### Workspace Structure

```
openclaw/
├── extensions/           # Plugin workspace
│   ├── my-channel/      # Your plugin directory
│   │   ├── src/
│   │   │   ├── channel.ts
│   │   │   └── runtime.ts
│   │   ├── channel.ts
│   │   ├── openclaw.plugin.json  (optional)
│   │   └── package.json
│   ├── telegram/
│   ├── discord/
│   └── voice-call/
├── src/
│   ├── plugin-sdk/      # Core SDK exports
│   └── channels/        # Built-in channel implementations
└── package.json
```

### Plugin Package.json

```json
{
  "name": "@openclaw/my-channel",
  "version": "2026.2.2",
  "description": "OpenClaw MyChannel plugin",
  "type": "module",
  "dependencies": {
    // Runtime dependencies only
    "ws": "^8.19.0"
  },
  "devDependencies": {
    "openclaw": "workspace:*"
  },
  "openclaw": {
    "extensions": ["./channel.ts"]
  }
}
```

> **Important**: Runtime dependencies must be in `dependencies`, not `devDependencies`. Use `openclaw` in `devDependencies` or `peerDependencies` only.

---

## Plugin Types

OpenClaw supports several plugin types:

| Type | Description | Example |
|------|-------------|---------|
| **Channel** | Messaging platform integration | `telegram`, `discord`, `slack` |
| **Provider** | AI model provider | `openai`, `anthropic`, custom |
| **Service** | Background service | `voice-call`, webhook listener |
| **Tool** | Agent-accessible tools | Database query, API wrapper |
| **Command** | Custom slash commands | `/tts`, `/custom` |
| **Hook** | Lifecycle event handlers | Message transformation, logging |

---

## Channel Plugin Development

Channel plugins are the most common plugin type, integrating messaging platforms with OpenClaw.

### Plugin Structure

A minimal channel plugin:

```
extensions/my-channel/
├── src/
│   ├── channel.ts      # Main plugin implementation
│   ├── runtime.ts      # Platform-specific runtime (optional)
│   ├── providers/      # Provider implementations (optional)
│   └── types.ts        # Type definitions (optional)
├── channel.ts            # Plugin entry point
├── package.json
└── README.md
```

### Channel Plugin Interface

The core `ChannelPlugin` interface from `openclaw/plugin-sdk`:

```typescript
import type { ChannelPlugin } from "openclaw/plugin-sdk";

export interface ChannelPlugin<TResolvedAccount = any> {
  // Identification
  id: string;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;

  // Adapters (see detailed sections below)
  config?: ChannelConfigAdapter<TResolvedAccount>;
  configSchema?: ChannelConfigSchema;
  onboarding?: ChannelOnboardingAdapter;
  setup?: ChannelSetupAdapter;
  pairing?: ChannelPairingAdapter;
  security?: ChannelSecurityAdapter<TResolvedAccount>;
  groups?: ChannelGroupAdapter;
  outbound?: ChannelOutboundAdapter;
  status?: ChannelStatusAdapter<TResolvedAccount>;
  gateway?: ChannelGatewayAdapter<TResolvedAccount>;
  auth?: ChannelAuthAdapter;
  messaging?: ChannelMessagingAdapter;
  directory?: ChannelDirectoryAdapter;
  resolver?: ChannelResolverAdapter;
  actions?: ChannelMessageActionAdapter;
  streaming?: ChannelStreamingAdapter;
  threading?: ChannelThreadingAdapter;
  mentions?: ChannelMentionAdapter;
  heartbeat?: ChannelHeartbeatAdapter;
  agentTools?: ChannelAgentTool[];
}
```

### Basic Channel Plugin Example

```typescript
// extensions/my-channel/src/channel.ts
import type {
  ChannelPlugin,
  ChannelOutboundAdapter,
  ChannelConfigAdapter,
  ResolvedAccount,
  OpenClawConfig,
} from "openclaw/plugin-sdk";

// Define your account type
interface MyChannelAccount {
  accountId: string;
  token: string;
  enabled: boolean;
  config: {
    allowFrom?: string[];
    dmPolicy?: string;
  };
}

// Create the plugin
export const myChannelPlugin: ChannelPlugin<MyChannelAccount> = {
  id: "mychannel",
  meta: {
    id: "mychannel",
    label: "MyChannel",
    selectionLabel: "MyChannel",
    docsPath: "/channels/mychannel",
    blurb: "Custom messaging platform integration",
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    nativeCommands: true,
    blockStreaming: false,
  },

  // Configuration adapter
  config: {
    listAccountIds: (cfg) => {
      const accounts = cfg.channels?.mychannel?.accounts;
      return accounts ? Object.keys(accounts) : [];
    },
    resolveAccount: (cfg, accountId) => {
      const section = cfg.channels?.mychannel;
      if (!section) throw new Error("MyChannel not configured");

      const account = accountId
        ? section.accounts?.[accountId]
        : { botToken: section.botToken };

      return {
        accountId: accountId ?? "default",
        token: account.botToken || section.botToken || "",
        enabled: account.enabled ?? true,
        config: {
          allowFrom: account.allowFrom || section.allowFrom,
          dmPolicy: account.dmPolicy || section.dmPolicy || "pairing",
        },
      };
    },
    isConfigured: (account) => Boolean(account.token?.trim()),
  },

  // Outbound adapter for sending messages
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 2000,
    sendText: async ({ to, text, accountId, replyToId }) => {
      // Your platform's send implementation
      const result = await sendMessageToPlatform({
        recipient: to,
        message: text,
        replyTo: replyToId,
      });

      return {
        channel: "mychannel",
        ok: result.success,
        target: to,
        timestamp: Date.now(),
      };
    },
    sendMedia: async ({ to, text, mediaUrl }) => {
      // Media sending implementation
      const result = await sendMediaToPlatform({
        recipient: to,
        caption: text,
        url: mediaUrl,
      });

      return {
        channel: "mychannel",
        ok: result.success,
        target: to,
        timestamp: Date.now(),
      };
    },
  },
};
```

```typescript
// extensions/my-channel/channel.ts
import { myChannelPlugin } from "./src/channel.js";

export default {
  id: "my-channel",
  name: "MyChannel Plugin",
  description: "MyChannel integration for OpenClaw",
  register(api) {
    api.registerChannel(myChannelPlugin);
  },
};
```

### Adapters Reference

#### 1. Config Adapter (`ChannelConfigAdapter`)

Manages account configuration and lifecycle.

```typescript
config: {
  // List all configured account IDs
  listAccountIds: (cfg: OpenClawConfig) => string[];

  // Resolve account from config
  resolveAccount: (
    cfg: OpenClawConfig,
    accountId?: string | null
  ) => ResolvedAccount;

  // Default account ID (optional)
  defaultAccountId?: (cfg: OpenClawConfig) => string;

  // Enable/disable account
  setAccountEnabled?: (params: {
    cfg: OpenClawConfig;
    accountId: string;
    enabled: boolean;
  }) => OpenClawConfig;

  // Delete account
  deleteAccount?: (params: {
    cfg: OpenClawConfig;
    accountId: string;
  }) => OpenClawConfig;

  // Check if configured
  isConfigured?: (account: ResolvedAccount) => boolean | Promise<boolean>;

  // Account description for status
  describeAccount?: (account: ResolvedAccount) => ChannelAccountSnapshot;
}
```

#### 2. Outbound Adapter (`ChannelOutboundAdapter`)

Handles message sending to the platform.

```typescript
outbound: {
  // Delivery mode: "direct" | "gateway" | "hybrid"
  deliveryMode: "direct";

  // Text chunking function (optional)
  chunker?: (text: string, limit: number) => string[];
  chunkerMode?: "text" | "markdown";
  textChunkLimit?: number;

  // Target resolution
  resolveTarget?: (params: {
    cfg?: OpenClawConfig;
    to?: string;
    allowFrom?: string[];
    accountId?: string | null;
    mode?: ChannelOutboundTargetMode;
  }) => { ok: true; to: string } | { ok: false; error: Error };

  // Send text message
  sendText?: (ctx: {
    cfg: OpenClawConfig;
    to: string;
    text: string;
    mediaUrl?: string;
    replyToId?: string | null;
    threadId?: string | number | null;
    accountId?: string | null;
  }) => Promise<OutboundDeliveryResult>;

  // Send media
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;

  // Send poll (if supported)
  sendPoll?: (ctx: ChannelPollContext) => Promise<ChannelPollResult>;
}
```

#### 3. Gateway Adapter (`ChannelGatewayAdapter`)

Manages the gateway lifecycle for long-running connections.

```typescript
gateway: {
  // Start account (webhook/polling listener)
  startAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<unknown>;

  // Stop account
  stopAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<void>;

  // QR code login (for platforms that support it)
  loginWithQrStart?: (params: {
    accountId?: string;
    force?: boolean;
    timeoutMs?: number;
  }) => Promise<ChannelLoginWithQrStartResult>;

  loginWithQrWait?: (params: {
    accountId?: string;
    timeoutMs?: number;
  }) => Promise<ChannelLoginWithQrWaitResult>;

  // Logout
  logoutAccount?: (ctx: ChannelLogoutContext<ResolvedAccount>) => Promise<ChannelLogoutResult>;
}
```

#### 4. Status Adapter (`ChannelStatusAdapter`)

Provides account status and diagnostics.

```typescript
status: {
  // Default runtime state
  defaultRuntime?: ChannelAccountSnapshot;

  // Build channel summary
  buildChannelSummary?: (params: {
    account: ResolvedAccount;
    cfg: OpenClawConfig;
    snapshot: ChannelAccountSnapshot;
  }) => Record<string, unknown>;

  // Probe account (check if token is valid)
  probeAccount?: (params: {
    account: ResolvedAccount;
    timeoutMs: number;
  }) => Promise<unknown>;

  // Audit account (check group membership, etc.)
  auditAccount?: (params: {
    account: ResolvedAccount;
    timeoutMs: number;
    probe?: unknown;
  }) => Promise<unknown>;

  // Build account snapshot
  buildAccountSnapshot?: (params: {
    account: ResolvedAccount;
    cfg: OpenClawConfig;
    runtime?: ChannelAccountSnapshot;
    probe?: unknown;
    audit?: unknown;
  }) => ChannelAccountSnapshot;
}
```

#### 5. Security Adapter (`ChannelSecurityAdapter`)

Handles security policies and warnings.

```typescript
security: {
  // Resolve DM policy for inbound messages
  resolveDmPolicy?: (ctx: ChannelSecurityContext<ResolvedAccount>) =>
    ChannelSecurityDmPolicy | null;

  // Collect security warnings
  collectWarnings?: (ctx: ChannelSecurityContext<ResolvedAccount>) =>
    Promise<string[]> | string[];
}
```

#### 6. Directory Adapter (`ChannelDirectoryAdapter`)

Provides user/group directory lookups.

```typescript
directory: {
  // Get self (bot) entry
  self?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    runtime: RuntimeEnv;
  }) => Promise<ChannelDirectoryEntry | null>;

  // List users
  listPeers?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    query?: string | null;
    limit?: number | null;
    runtime: RuntimeEnv;
  }) => Promise<ChannelDirectoryEntry[]>;

  // List groups
  listGroups?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    query?: string | null;
    limit?: number | null;
    runtime: RuntimeEnv;
  }) => Promise<ChannelDirectoryEntry[]>;

  // List group members
  listGroupMembers?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    groupId: string;
    limit?: number | null;
    runtime: RuntimeEnv;
  }) => Promise<ChannelDirectoryEntry[]>;
}
```

#### 7. Messaging Adapter (`ChannelMessagingAdapter`)

Normalizes messaging targets and formats.

```typescript
messaging: {
  // Normalize target (phone number, username, etc.)
  normalizeTarget?: (raw: string) => string | undefined;

  // Target resolver
  targetResolver?: {
    looksLikeId?: (raw: string, normalized?: string) => boolean;
    hint?: string;  // e.g. "<userId>"
  };

  // Format display name
  formatTargetDisplay?: (params: {
    target: string;
    display?: string;
    kind?: ChannelDirectoryEntryKind;
  }) => string;
}
```

#### 8. Threading Adapter (`ChannelThreadingAdapter`)

Manages threaded conversation support.

```typescript
threading: {
  // Resolve reply-to mode
  resolveReplyToMode?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    chatType?: string | null;
  }) => "off" | "first" | "all";

  // Allow tags when threading is off
  allowTagsWhenOff?: boolean;

  // Build tool context for thread info
  buildToolContext?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    context: ChannelThreadingContext;
    hasRepliedRef?: { value: boolean };
  }) => ChannelThreadingToolContext | undefined;
}
```

#### 9. Streaming Adapter (`ChannelStreamingAdapter`)

Configures streaming behavior for long messages.

```typescript
streaming: {
  // Block streaming coalescence defaults
  blockStreamingCoalesceDefaults?: {
    minChars: number;   // Default: 100
    idleMs: number;     // Default: 80
  };
}
```

#### 10. Actions Adapter (`ChannelMessageActionAdapter`)

Platform-specific message actions.

```typescript
actions: {
  // List supported actions
  listActions?: (params: { cfg: OpenClawConfig }) => ChannelMessageActionName[];

  // Check if action is supported
  supportsAction?: (params: { action: ChannelMessageActionName }) => boolean;

  // Check if buttons are supported
  supportsButtons?: (params: { cfg: OpenClawConfig }) => boolean;

  // Extract tool send parameters
  extractToolSend?: (params: { args: Record<string, unknown> }) =>
    ChannelToolSend | null;

  // Handle action
  handleAction?: (ctx: ChannelMessageActionContext) =>
    Promise<AgentToolResult<unknown>>;
}
```

#### 11. Groups Adapter (`ChannelGroupAdapter`)

Group-specific behavior configuration.

```typescript
groups: {
  // Resolve if mention is required in groups
  resolveRequireMention?: (params: ChannelGroupContext) =>
    boolean | undefined;

  // Resolve group intro hint
  resolveGroupIntroHint?: (params: ChannelGroupContext) =>
    string | undefined;

  // Resolve tool policy for groups
  resolveToolPolicy?: (params: ChannelGroupContext) =>
    GroupToolPolicyConfig | undefined;
}
```

### Configuration Schema

Define your plugin's configuration schema with JSON Schema for validation and UI hints:

```typescript
import { buildChannelConfigSchema } from "openclaw/plugin-sdk";

const MyChannelConfigSchema = {
  type: "object",
  properties: {
    botToken: { type: "string" },
    tokenFile: { type: "string" },
    enabled: { type: "boolean" },
    webhookUrl: { type: "string" },
    allowFrom: {
      type: "array",
      items: { type: "string" }
    },
    dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
  },
};

export const myChannelPlugin: ChannelPlugin = {
  // ...
  configSchema: buildChannelConfigSchema(MyChannelConfigSchema),
};
```

### Full-Duplex Communication

Full-duplex communication enables simultaneous bidirectional message flow, critical for real-time conversational platforms.

#### WebSocket-Based Full-Duplex

```typescript
// Example: WebSocket-based full-duplex channel
export const fullDuplexPlugin: ChannelPlugin = {
  id: "fullduplex",
  // ... other adapters

  gateway: {
    startAccount: async ({ account, abortSignal, cfg, runtime }) => {
      const ws = new WebSocket("wss://api.example.com/socket");

      ws.onopen = () => {
        console.log("[fullduplex] Connected");
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        // Dispatch inbound message to OpenClaw
        await runtime.channel.reply.dispatchReplyWithTyping({
          cfg,
          to: message.from,
          text: message.text,
          channelId: "fullduplex",
          accountId: account.accountId,
        });
      };

      abortSignal.addEventListener("abort", () => {
        ws.close();
      });

      return { ws };
    },
  },

  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text }) => {
      // Send via WebSocket
      ws.send(JSON.stringify({ to, text }));
      return { ok: true };
    },
  },
};
```

#### Streaming with Block Coalescence

For platforms that support real-time streaming:

```typescript
export const streamingPlugin: ChannelPlugin = {
  id: "streaming",
  capabilities: {
    chatTypes: ["direct"],
    media: false,
    blockStreaming: true,  // Enable block streaming
  },

  streaming: {
    blockStreamingCoalesceDefaults: {
      minChars: 80,    // Minimum characters before flushing
      idleMs: 100,     // Idle time before flush
    },
  },

  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text, deps }) => {
      // Use streaming chunker
      const chunks = deps?.chunkText(text, 2000) || [text];

      for (const chunk of chunks) {
        await sendStreamingChunk(to, chunk);
        await delay(100); // Simulate streaming
      }

      return { ok: true };
    },
  },
};
```

### Multi-modal Support

Multi-modal support enables rich media interactions: images, audio, video, files, and interactive elements.

#### Image/Video Support

```typescript
export const multiModalPlugin: ChannelPlugin = {
  id: "multimodal",
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,  // Enable media support
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 2000,
    sendMedia: async ({ to, text, mediaUrl, deps }) => {
      // Load and validate media
      const media = await deps?.loadWebMedia?.(mediaUrl);
      if (!media) {
        throw new Error("Failed to load media");
      }

      // Detect MIME type
      const mimeType = await deps?.detectMime(media.url);
      const extension = deps?.extensionForMime(mimeType);

      // Platform-specific media upload
      const uploadedUrl = await uploadMediaToPlatform({
        file: media.buffer,
        mimeType,
        filename: `media.${extension}`,
      });

      // Send with caption
      await sendMediaMessage({
        to,
        mediaUrl: uploadedUrl,
        caption: text,
      });

      return { ok: true, target: to };
    },
  },
};
```

#### Interactive Cards and Buttons

```typescript
export const interactivePlugin: ChannelPlugin = {
  id: "interactive",
  capabilities: {
    chatTypes: ["direct"],
    media: true,
  },

  actions: {
    supportsButtons: () => true,
    supportsCards: () => true,

    handleAction: async ({ action, params, cfg }) => {
      switch (action) {
        case "send_button":
          await sendButtonMessage({
            to: params.to as string,
            text: params.text as string,
            buttons: [
              { label: "Yes", value: "yes" },
              { label: "No", value: "no" },
            ],
          });
          return { ok: true };

        case "send_card":
          await sendCardMessage({
            to: params.to as string,
            title: params.title as string,
            body: params.body as string,
            imageUrl: params.imageUrl as string,
            buttons: [
              { label: "View", action: "open_url", url: params.url as string },
            ],
          });
          return { ok: true };
      }

      return { ok: false, error: "Unknown action" };
    },
  },
};
```

#### Voice/Audio Support

```typescript
export const voicePlugin: ChannelPlugin = {
  id: "voice",
  capabilities: {
    chatTypes: ["direct"],
    media: true,
  },

  outbound: {
    deliveryMode: "direct",
    sendMedia: async ({ to, mediaUrl, deps }) => {
      // Check if audio
      const mimeType = await deps?.detectMime(mediaUrl);
      if (!mimeType?.startsWith("audio/")) {
        throw new Error("Not an audio file");
      }

      // Process audio for voice-compatible format
      const audioBuffer = await fetch(mediaUrl).then(r => r.arrayBuffer());
      const processedAudio = await processVoiceAudio(audioBuffer);

      // Send voice message
      await sendVoiceMessage({
        to,
        audio: processedAudio,
        duration: processedAudio.duration,
      });

      return { ok: true };
    },
  },
};
```

---

## Available APIs and SDK

### Plugin Runtime API

Access the full OpenClaw runtime from your plugin:

```typescript
export type PluginRuntime = {
  version: string;
  config: {
    loadConfig: () => OpenClawConfig;
    writeConfigFile: (cfg: OpenClawConfig) => Promise<void>;
  };
  system: {
    enqueueSystemEvent: (event: unknown) => void;
    runCommandWithTimeout: (cmd: string, timeout: number) => Promise<string>;
  };
  media: {
    loadWebMedia: (url: string) => Promise<WebMediaResult>;
    detectMime: (input: string | Buffer) => Promise<string>;
    getImageMetadata: (buffer: Buffer) => Promise<{ width: number; height: number }>;
  };
  tts: {
    textToSpeechTelephony: (text: string, options?: TTSOptions) => Promise<Buffer>;
  };
  tools: {
    createMemoryGetTool: () => AgentTool;
    createMemorySearchTool: () => AgentTool;
  };
  channel: {
    text: {
      chunkText: (text: string, limit?: number) => string[];
      resolveChunkMode: (cfg: OpenClawConfig) => ChunkMode;
    };
    reply: {
      dispatchReplyWithTyping: (params: ReplyDispatchParams) => Promise<void>;
      formatEnvelope: (params: EnvelopeParams) => string;
    };
    routing: {
      resolveAgentRoute: (params: RouteParams) => string | null;
    };
  };
  logging: {
    shouldLogVerbose: () => boolean;
    getChildLogger: (context: string) => Logger;
  };
  state: {
    resolveStateDir: () => string;
  };
};
```

### Plugin API Methods

```typescript
export type OpenClawPluginApi = {
  id: string;
  name: string;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;

  // Register agent tools
  registerTool: (
    tool: AnyAgentTool | OpenClawPluginToolFactory,
    opts?: OpenClawPluginToolOptions
  ) => void;

  // Register lifecycle hooks
  registerHook: (
    events: string | string[],
    handler: InternalHookHandler,
    opts?: OpenClawPluginHookOptions
  ) => void;

  // Register HTTP handlers
  registerHttpHandler: (handler: OpenClawPluginHttpHandler) => void;
  registerHttpRoute: (params: {
    path: string;
    handler: OpenClawPluginHttpRouteHandler
  }) => void;

  // Register channel
  registerChannel: (registration: OpenClawPluginChannelRegistration) => void;

  // Register gateway method (WebSocket RPC)
  registerGatewayMethod: (method: string, handler: GatewayRequestHandler) => void;

  // Register CLI commands
  registerCli: (
    registrar: OpenClawPluginCliRegistrar,
    opts?: { commands?: string[] }
  ) => void;

  // Register background service
  registerService: (service: OpenClawPluginService) => void;

  // Register AI provider
  registerProvider: (provider: ProviderPlugin) => void;

  // Register custom slash command
  registerCommand: (command: OpenClawPluginCommandDefinition) => void;

  // Resolve file paths
  resolvePath: (input: string) => string;

  // Lifecycle hooks (alternative to registerHook)
  on: <K extends PluginHookName>(
    hookName: K,
    handler: PluginHookHandlerMap[K],
    opts?: { priority?: number }
  ) => void;
};
```

### Hook Events

```typescript
export type PluginHookName =
  | "before_agent_start"    // Before agent processes message
  | "agent_end"             // After agent completes
  | "message_received"      // When inbound message arrives
  | "message_sending"       // Before outbound send
  | "message_sent"          // After outbound send
  | "before_tool_call"      // Before tool execution
  | "after_tool_call"       // After tool execution
  | "session_start"         // When session begins
  | "session_end"           // When session ends
  | "gateway_start"         // When gateway starts
  | "gateway_stop";         // When gateway stops
```

---

## Complete Examples

### Example 1: Simple Bot Channel

A complete minimal channel plugin for a hypothetical messaging platform.

```typescript
// extensions/simplebot/src/channel.ts
import type {
  ChannelPlugin,
  ChannelOutboundAdapter,
  ChannelConfigAdapter,
  ChannelStatusAdapter,
  ChannelGatewayAdapter,
  ChannelMessagingAdapter,
  OpenClawConfig,
  ResolvedAccount,
} from "openclaw/plugin-sdk";

interface SimpleBotAccount {
  accountId: string;
  apiKey: string;
  enabled: boolean;
  baseUrl: string;
}

const DEFAULT_ACCOUNT_ID = "default";

export const simpleBotPlugin: ChannelPlugin<SimpleBotAccount> = {
  id: "simplebot",
  meta: {
    id: "simplebot",
    label: "SimpleBot",
    selectionLabel: "SimpleBot",
    docsPath: "/channels/simplebot",
    blurb: "Simple bot platform integration",
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    nativeCommands: true,
    blockStreaming: false,
  },

  // Configuration
  config: {
    listAccountIds: (cfg) => {
      const accounts = cfg.channels?.simplebot?.accounts;
      return accounts ? Object.keys(accounts) : [DEFAULT_ACCOUNT_ID];
    },

    resolveAccount: (cfg, accountId) => {
      const section = cfg.channels?.simplebot;
      if (!section) {
        throw new Error("SimpleBot not configured");
      }

      const resolvedAccountId = accountId || DEFAULT_ACCOUNT_ID;
      const account = resolvedAccountId === DEFAULT_ACCOUNT_ID
        ? section
        : section.accounts?.[resolvedAccountId];

      return {
        accountId: resolvedAccountId,
        apiKey: account?.apiKey || section.apiKey || "",
        enabled: account?.enabled ?? true,
        baseUrl: section.baseUrl || "https://api.simplebot.com",
      };
    },

    isConfigured: (account) => Boolean(account.apiKey?.trim()),
  },

  // Messaging
  messaging: {
    normalizeTarget: (raw) => {
      // Normalize username: @user -> user
      return raw.replace(/^@/, "").trim();
    },
    targetResolver: {
      looksLikeId: (raw) => /^\d+$/.test(raw),
      hint: "<userId or @username>",
    },
  },

  // Outbound
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async ({ to, text, accountId, replyToId }) => {
      // Send via SimpleBot API
      const response = await fetch("https://api.simplebot.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": accountId,  // Using accountId as API key for this example
        },
        body: JSON.stringify({
          to,
          text,
          reply_to: replyToId,
        }),
      });

      if (!response.ok) {
        throw new Error(`SimpleBot API error: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        channel: "simplebot",
        ok: true,
        target: to,
        timestamp: Date.now(),
        messageId: data.message_id,
      };
    },

    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
      const response = await fetch("https://api.simplebot.com/v1/media", {
        method: "POST",
        headers: {
          "X-API-Key": accountId,
        },
        body: JSON.stringify({
          to,
          url: mediaUrl,
          caption: text,
        }),
      });

      const data = await response.json();
      return {
        channel: "simplebot",
        ok: true,
        target: to,
        timestamp: Date.now(),
        messageId: data.message_id,
      };
    },
  },

  // Gateway (webhook listener)
  gateway: {
    startAccount: async ({ account, cfg, runtime, abortSignal }) => {
      // Start webhook listener
      const server = Bun?.serve || (await import("http")).createServer;

      const handler = async (req: Request) => {
        if (req.method !== "POST") {
          return new Response("Method not allowed", { status: 405 });
        }

        const body = await req.json();

        // Dispatch to OpenClaw
        await runtime.channel.reply.dispatchReplyWithTyping({
          cfg,
          to: body.from,
          text: body.text,
          channelId: "simplebot",
          accountId: account.accountId,
          mediaUrl: body.media_url,
          replyToId: body.reply_to_id,
        });

        return new Response("OK", { status: 200 });
      };

      const srv = server({
        port: 0,  // Random port
        fetch: handler,
      });

      abortSignal.addEventListener("abort", () => {
        srv.stop();
      });

      return { port: srv.port };
    },
  },

  // Status
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },

    probeAccount: async ({ account, timeoutMs }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${account.baseUrl}/v1/me`, {
          headers: { "X-API-Key": account.apiKey },
          signal: controller.signal,
        });

        if (response.ok) {
          return await response.json();
        }
        throw new Error(response.statusText);
      } finally {
        clearTimeout(timeout);
      }
    },

    buildAccountSnapshot: ({ account, runtime, probe }) => {
      return {
        accountId: account.accountId,
        enabled: account.enabled,
        configured: Boolean(account.apiKey?.trim()),
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe,
      };
    },
  },
};
```

```typescript
// extensions/simplebot/channel.ts
import { simpleBotPlugin } from "./src/channel.js";

export default {
  id: "simplebot",
  name: "SimpleBot Plugin",
  description: "SimpleBot platform integration",
  register(api) {
    api.registerChannel(simpleBotPlugin);
  },
};
```

```json
// extensions/simplebot/package.json
{
  "name": "@openclaw/simplebot",
  "version": "2026.2.2",
  "description": "OpenClaw SimpleBot plugin",
  "type": "module",
  "devDependencies": {
    "openclaw": "workspace:*"
  },
  "openclaw": {
    "extensions": ["./channel.ts"]
  }
}
```

### Example 2: Voice Call Channel (Full-Duplex Audio)

A simplified voice call channel with full-duplex audio support.

```typescript
// extensions/voice-channel/src/channel.ts
import type {
  ChannelPlugin,
  ChannelConfigAdapter,
  ChannelGatewayAdapter,
  ChannelOutboundAdapter,
  OpenClawConfig,
} from "openclaw/plugin-sdk";

interface VoiceChannelAccount {
  accountId: string;
  phoneNumber: string;
  apiKey: string;
  webhookUrl: string;
  enabled: boolean;
}

export const voiceChannelPlugin: ChannelPlugin<VoiceChannelAccount> = {
  id: "voice",
  meta: {
    id: "voice",
    label: "Voice",
    selectionLabel: "Voice Call",
    docsPath: "/channels/voice",
    blurb: "Full-duplex voice call channel",
    forceAccountBinding: true,
  },
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    blockStreaming: true,
  },

  config: {
    listAccountIds: (cfg) => {
      const accounts = cfg.channels?.voice?.accounts;
      return accounts ? Object.keys(accounts) : ["default"];
    },

    resolveAccount: (cfg, accountId) => {
      const section = cfg.channels?.voice;
      const id = accountId || "default";

      const account = id === "default" ? section : section?.accounts?.[id];

      return {
        accountId: id,
        phoneNumber: account?.phoneNumber || section?.phoneNumber || "",
        apiKey: account?.apiKey || section?.apiKey || "",
        webhookUrl: account?.webhookUrl || section?.webhookUrl || "",
        enabled: account?.enabled ?? true,
      };
    },

    isConfigured: (account) =>
      Boolean(account.phoneNumber?.trim() && account.apiKey?.trim()),
  },

  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text, accountId }) => {
      // TTS and call
      const response = await fetch("https://api.voice.com/v1/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": accountId,
        },
        body: JSON.stringify({
          to,
          message: text,
        }),
      });

      const data = await response.json();
      return {
        channel: "voice",
        ok: true,
        target: to,
        timestamp: Date.now(),
        callId: data.call_id,
      };
    },
  },

  gateway: {
    startAccount: async ({ account, cfg, runtime, abortSignal }) => {
      // Setup HTTP server for webhooks
      const handlers = new Map();

      const handleWebhook = async (event: {
        type: string;
        call_id: string;
        from: string;
        to: string;
        transcript?: string;
      }) => {
        switch (event.type) {
          case "call.started":
            handlers.set(event.call_id, {
              from: event.from,
              startedAt: Date.now(),
              transcript: [],
            });
            break;

          case "call.speech":
            const handler = handlers.get(event.call_id);
            if (handler) {
              handler.transcript.push({
                speaker: "user",
                text: event.transcript,
                timestamp: Date.now(),
              });

              // Send to agent for processing
              await runtime.channel.reply.dispatchReplyWithTyping({
                cfg,
                to: event.from,
                text: event.transcript,
                channelId: "voice",
                accountId: account.accountId,
                metadata: { callId: event.call_id },
              });
            }
            break;

          case "call.ended":
            handlers.delete(event.call_id);
            break;
        }
      };

      const server = Bun?.serve || (await import("http")).createServer;

      const srv = server({
        port: 0,
        fetch: async (req) => {
          if (req.method === "POST" && new URL(req.url).pathname === "/webhook") {
            const body = await req.json();
            await handleWebhook(body);
            return new Response("OK", { status: 200 });
          }
          return new Response("Not found", { status: 404 });
        },
      });

      abortSignal.addEventListener("abort", () => {
        srv.stop();
      });

      return { port: srv.port };
    },
  },
};
```

### Example 3: Plugin with Custom Tools

```typescript
// extensions/weather-tools/channel.ts
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const weatherTool = {
  name: "get_weather",
  label: "Get Weather",
  description: "Get current weather for a location",
  parameters: Type.Object({
    location: Type.String({ description: "City name or zip code" }),
    units: Type.Optional(Type.Union([
      Type.Literal("celsius"),
      Type.Literal("fahrenheit"),
    ])),
  }),
  async execute(_toolCallId, params) {
    const location = params.location as string;
    const units = (params.units as string) || "celsius";

    // Call weather API
    const response = await fetch(
      `https://api.weather.com/current?location=${encodeURIComponent(location)}&units=${units}`
    );
    const data = await response.json();

    return {
      content: [{
        type: "text",
        text: JSON.stringify(data, null, 2),
      }],
      details: data,
    };
  },
};

export default {
  id: "weather-tools",
  name: "Weather Tools",
  description: "Weather information tools",
  register(api: OpenClawPluginApi) {
    api.registerTool(weatherTool);
  },
};
```

---

## Testing

### Unit Tests

```typescript
// extensions/my-channel/src/channel.test.ts
import { describe, it, expect } from "vitest";
import { myChannelPlugin } from "./channel.js";

describe("MyChannel Plugin", () => {
  it("should have correct metadata", () => {
    expect(myChannelPlugin.id).toBe("mychannel");
    expect(myChannelPlugin.capabilities.chatTypes).toContain("direct");
  });

  it("should resolve account from config", () => {
    const cfg = {
      channels: {
        mychannel: {
          botToken: "test-token",
          enabled: true,
        },
      },
    };

    const account = myChannelPlugin.config?.resolveAccount(cfg, null);
    expect(account?.token).toBe("test-token");
  });

  it("should normalize target", () => {
    const normalized = myChannelPlugin.messaging?.normalizeTarget?.("@user123");
    expect(normalized).toBe("user123");
  });
});
```

Run tests:

```bash
pnpm test          # Run all tests
pnpm test:filter my-channel  # Run specific tests
```

### Integration Tests

```typescript
// extensions/my-channel/src/integration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { myChannelPlugin } from "./channel.js";

describe("MyChannel Integration", () => {
  let account: any;

  beforeAll(() => {
    const cfg = loadTestConfig();
    account = myChannelPlugin.config?.resolveAccount(cfg, null);
  });

  it("should send message successfully", async () => {
    const result = await myChannelPlugin.outbound?.sendText?.({
      to: "+1234567890",
      text: "Hello from test",
      accountId: account.accountId,
    });

    expect(result?.ok).toBe(true);
  });

  it("should probe account", async () => {
    const probe = await myChannelPlugin.status?.probeAccount?.({
      account,
      timeoutMs: 5000,
      cfg: loadTestConfig(),
    });

    expect(probe).toBeDefined();
  }, 10000);
});
```

### Live Tests

```bash
# Run with real credentials
LIVE=1 pnpm test:live

# Docker-based live tests
pnpm test:docker:live-gateway
```

---

## Publishing

### Version Management

Update version in `package.json`:

```json
{
  "name": "@openclaw/my-channel",
  "version": "2026.2.2"
}
```

### Publishing to npm

1. **Build the package**:
```bash
cd extensions/my-channel
pnpm build
```

2. **Publish**:
```bash
# Login to npm (if not already logged in)
npm login

# Publish
npm publish --access public
```

### Local Testing Before Publishing

Link the package locally:

```bash
cd extensions/my-channel
pnpm link --global

cd /path/to/test-project
pnpm link --global @openclaw/my-channel
```

---

## Additional Resources

- **Official Docs**: https://docs.openclaw.ai/plugin
- **Core Plugins**: Check `extensions/` directory for examples
- **Built-in Channels**: Check `src/channels/` for core implementations
- **Plugin SDK**: Check `src/plugin-sdk/channel.ts` for all exports

---

## Troubleshooting

### Plugin Not Loading

- Check `package.json` has correct `openclaw.extensions` entry
- Verify `channel.ts` exports a default plugin object
- Ensure dependencies are in `dependencies`, not `devDependencies`

### Runtime Errors

- Use `api.logger.error()` to log errors
- Check plugin config with `api.pluginConfig`
- Use `api.runtime` to access core functionality

### Type Errors

- Import types from `openclaw/plugin-sdk`
- Use `ResolvedAccount` generic type for type safety
- Check `src/channels/plugins/types.ts` for all type definitions
