# QQ Messaging Capability

Core QQ message sending and receiving via NapCat WebSocket API.

## ADDED Requirements

### Requirement: Send private message
The plugin SHALL send text messages to individual QQ users via NapCat's `send_private_msg` API.

#### Scenario: Send text to private chat
- **WHEN** OpenClaw requests to send a text message to a QQ user
- **THEN** plugin formats the message as NapCat `send_private_msg` action
- **AND** includes `user_id`, `message` array with text segment
- **AND** sends via WebSocket connection
- **AND** returns success when NapCat acknowledges

#### Scenario: Private message send failure
- **WHEN** NapCat WebSocket connection is not established
- **THEN** plugin returns error indicating connection unavailable
- **AND** does not queue the message for retry

### Requirement: Send group message
The plugin SHALL send text messages to QQ groups via NapCat's `send_group_msg` API.

#### Scenario: Send text to group chat
- **WHEN** OpenClaw requests to send a text message to a QQ group
- **THEN** plugin formats the message as NapCat `send_group_msg` action
- **AND** includes `group_id`, `message` array with text segment
- **AND** sends via WebSocket connection
- **AND** returns success when NapCat acknowledges

#### Scenario: Group message with at-mention
- **WHEN** OpenClaw requests to send a message with @mention in a group
- **THEN** plugin formats the @mention as NapCat `at` message segment
- **AND** includes the target user's QQ number in the at segment data

### Requirement: Receive private message
The plugin SHALL receive and translate private message events from NapCat into OpenClaw message format.

#### Scenario: Receive private text message
- **WHEN** NapCat sends a `message_private_sent_type` event via WebSocket
- **THEN** plugin extracts message content, sender ID, and timestamp
- **AND** translates NapCat message segments to OpenClaw format
- **AND** dispatches the message to OpenClaw's channel handler

#### Scenario: Receive private message with image
- **WHEN** NapCat sends a private message containing an image segment
- **THEN** plugin extracts the image URL from NapCat image data
- **AND** includes the image URL in OpenClaw message format
- **AND** preserves the original sender information

### Requirement: Receive group message
The plugin SHALL receive and translate group message events from NapCat into OpenClaw message format.

#### Scenario: Receive group text message
- **WHEN** NapCat sends a `message_sent_type` event via WebSocket
- **THEN** plugin extracts message content, sender ID, group ID, and timestamp
- **AND** translates NapCat message segments to OpenClaw format
- **AND** includes group context in the dispatched message

#### Scenario: Receive group at-mention
- **WHEN** NapCat sends a group message containing an at segment directed at the bot
- **THEN** plugin identifies the at-mention in message segments
- **AND** flags the message as a mention in OpenClaw format
- **AND** includes the sender who mentioned the bot

### Requirement: Message echo matching
The plugin SHALL match NapCat response echoes to original requests for correlation.

#### Scenario: Echo matches sent message
- **WHEN** sending a message with an `echo` identifier
- **THEN** plugin includes a unique echo ID in the NapCat request
- **AND** uses the echo ID to correlate NapCat's response
- **AND** returns the correlated result to OpenClaw

### Requirement: Message ID conversion
The plugin SHALL convert NapCat integer message IDs to string format for OpenClaw compatibility.

#### Scenario: Convert message ID on receive
- **WHEN** receiving a message from NapCat with integer `message_id`
- **THEN** plugin converts the message ID to string
- **AND** uses the string ID in OpenClaw message format

#### Scenario: Handle missing message ID
- **WHEN** NapCat event does not include a message ID
- **THEN** plugin generates a unique string ID
- **AND** logs a warning about missing message ID
