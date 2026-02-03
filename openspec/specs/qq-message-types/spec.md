# QQ Message Types Capability

Support for text, image, at, reply, and other QQ message types.

## ADDED Requirements

### Requirement: Text message handling
The plugin SHALL support text messages in both inbound and outbound directions.

#### Scenario: Send text message
- **WHEN** OpenClaw sends a text message
- **THEN** plugin formats as NapCat text segment: `{ type: "text", data: { text: "..." } }`
- **AND** includes the segment in the message array

#### Scenario: Receive text message
- **WHEN** NapCat sends a message with text segments
- **THEN** plugin concatenates all text segments in order
- **AND** presents the combined text to OpenClaw

### Requirement: At-mention handling
The plugin SHALL support @mentions in group messages.

#### Scenario: Send at-mention in group
- **WHEN** OpenClaw sends a message with an @mention
- **THEN** plugin formats as NapCat at segment: `{ type: "at", data: { qq: "user_id" } }`
- **AND** includes the target user's QQ number

#### Scenario: Receive at-mention of bot
- **WHEN** NapCat sends a group message with at segment pointing to bot
- **THEN** plugin identifies the bot is being mentioned
- **AND** flags the message for priority handling

#### Scenario: At-all mention
- **WHEN** NapCat sends a message with at-all segment
- **THEN** plugin translates as a special @all mention
- **AND** flags the message as a group-wide announcement

### Requirement: Image message handling
The plugin SHALL support image messages with URL references.

#### Scenario: Send image URL
- **WHEN** OpenClaw sends a message containing an image URL
- **THEN** plugin formats as NapCat image segment: `{ type: "image", data: { file: "url" } }`
- **AND** includes the image URL in the file field

#### Scenario: Receive image message
- **WHEN** NapCat sends a message with image segment
- **THEN** plugin extracts the image URL from the segment data
- **AND** presents the URL to OpenClaw as an image attachment
- **AND** includes any available image metadata (width, height, file size)

#### Scenario: Image without URL
- **WHEN** NapCat sends an image segment with only file path (no URL)
- **THEN** plugin logs a warning about unsupported local image
- **AND** presents a placeholder to OpenClaw indicating image unavailable

### Requirement: Reply message handling
The plugin SHALL support message replies (replying to a previous message).

#### Scenario: Send reply message
- **WHEN** OpenClaw sends a message replying to a previous message
- **THEN** plugin formats as NapCat reply segment: `{ type: "reply", data: { id: "message_id" } }`
- **AND** includes the original message ID being replied to

#### Scenario: Receive reply message
- **WHEN** NapCat sends a message with reply segment
- **THEN** plugin extracts the reply message ID
- **AND** includes the reply context in OpenClaw message format
- **AND** marks the message as a reply for threading

### Requirement: Message segment combination
The plugin SHALL support messages with multiple segment types (e.g., text + at + image).

#### Scenario: Send mixed content message
- **WHEN** OpenClaw sends a message with text and @mention
- **THEN** plugin formats as array of segments: `[text, at]`
- **AND** preserves the order of content

#### Scenario: Receive mixed content message
- **WHEN** NapCat sends a message with text, at, and image segments
- **THEN** plugin processes each segment in order
- **AND** reconstructs the message for OpenClaw with all content types

### Requirement: Unknown message type handling
The plugin SHALL gracefully handle unsupported NapCat message types.

#### Scenario: Receive unknown message type
- **WHEN** NapCat sends a message with an unrecognized segment type
- **THEN** plugin logs a warning about the unknown type
- **AND** skips the unsupported segment
- **AND** continues processing remaining segments

#### Scenario: Entirely unknown message
- **WHEN** NapCat sends a message with only unsupported segments
- **THEN** plugin logs a warning
- **AND** sends a minimal text placeholder to OpenClaw
- **AND** does not crash or throw an error

### Requirement: Face/emoji handling
The plugin SHALL support QQ face/emoji messages.

#### Scenario: Receive face message
- **WHEN** NapCat sends a message with face segment
- **THEN** plugin extracts the face ID
- **AND** maps to appropriate emoji or presents as text representation

#### Scenario: Send face message
- **WHEN** OpenClaw sends a message with emoji
- **THEN** plugin attempts to map to QQ face if available
- **AND** falls back to text if no matching face exists

### Requirement: Poke/戳一戳 handling
The plugin SHALL handle poke/nudge messages from NapCat.

#### Scenario: Receive poke message
- **WHEN** NapCat sends a poke message event
- **THEN** plugin identifies the action type
- **AND** presents as a special message type to OpenClaw
- **AND** includes the sender and target user information
