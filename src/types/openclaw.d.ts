/**
 * Type declarations for OpenClaw plugin API
 * These types are provided by the OpenClaw runtime
 */

export interface PluginAPI {
  config: PluginConfig;
  channels: ChannelAPI;
  services: ServiceAPI;
  logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
}

export interface PluginConfig {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  debug: boolean;
}

export interface ChannelAPI {
  register: (definition: ChannelDefinition) => Promise<void>;
}

export interface ServiceAPI {
  register: (service: ServiceDefinition) => Promise<ServiceLifecycle>;
}

export interface ChannelDefinition {
  id: string;
  label: string;
  blurb: string;
  icon?: string;
  capabilities: {
    chatTypes: ('direct' | 'group')[];
    messageTypes?: string[];
    features?: string[];
  };
  config: {
    listAccountIds: () => Promise<string[]>;
    resolveAccount: (accountId: string) => Promise<ChannelConfig | null>;
  };
  outbound: {
    sendText: (
      accountId: string,
      chatId: string,
      chatType: 'direct' | 'group',
      content: unknown
    ) => Promise<{ messageId: string } | { error: string }>;
  };
}

export interface ChannelConfig {
  id: string;
  label: string;
  status: string;
}

export interface ServiceDefinition {
  id: string;
  label: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface ServiceLifecycle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}
