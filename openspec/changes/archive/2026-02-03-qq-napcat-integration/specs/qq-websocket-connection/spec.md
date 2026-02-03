# QQ WebSocket Connection Capability

WebSocket connection lifecycle management (connect, reconnect, heartbeat) for NapCat.

## ADDED Requirements

### Requirement: Establish WebSocket connection
The plugin SHALL establish a WebSocket connection to NapCat for each configured QQ account.

#### Scenario: Connect on plugin start
- **WHEN** OpenClaw Gateway starts the plugin
- **THEN** plugin reads all enabled accounts from `channels.qq.accounts`
- **AND** establishes a WebSocket connection to each account's `wsUrl`
- **AND** includes `accessToken` in connection headers if configured

#### Scenario: Connection authentication
- **WHEN** NapCat WebSocket requires authentication
- **THEN** plugin sends the access token in the connection handshake
- **AND** handles authentication failure gracefully
- **AND** logs error and schedules reconnect on auth failure

### Requirement: Handle connection lifecycle events
The plugin SHALL handle WebSocket open, message, error, and close events.

#### Scenario: Connection opened successfully
- **WHEN** WebSocket connection opens
- **THEN** plugin logs connection success with account identifier
- **AND** starts heartbeat interval
- **AND** marks the account as available for messaging

#### Scenario: Connection error occurs
- **WHEN** WebSocket emits an error event
- **THEN** plugin logs the error details
- **AND** marks the account as unavailable
- **AND** does not attempt immediate reconnect (let close handler handle it)

#### Scenario: Connection closes unexpectedly
- **WHEN** WebSocket connection closes with unexpected code
- **THEN** plugin logs the close code and reason
- **AND** marks the account as unavailable
- **AND** schedules reconnection with exponential backoff

### Requirement: Automatic reconnection
The plugin SHALL automatically reconnect to NapCat with exponential backoff after connection loss.

#### Scenario: Reconnect after disconnect
- **WHEN** WebSocket connection closes unexpectedly
- **THEN** plugin schedules a reconnection attempt
- **AND** waits with exponential backoff starting at 1 second, max 30 seconds
- **AND** attempts reconnection up to 10 times before giving up

#### Scenario: Successful reconnection
- **WHEN** a reconnection attempt succeeds
- **THEN** plugin resets the backoff timer to initial value
- **AND** logs reconnection success
- **AND** marks the account as available

#### Scenario: Max reconnect attempts reached
- **WHEN** plugin fails to reconnect after 10 attempts
- **THEN** plugin stops reconnection attempts
- **AND** marks the account as permanently failed
- **AND** logs error requiring manual intervention

### Requirement: Heartbeat keep-alive
The plugin SHALL send periodic heartbeat messages to maintain the WebSocket connection.

#### Scenario: Send heartbeat interval
- **WHEN** WebSocket connection is established
- **THEN** plugin starts a heartbeat timer every 30 seconds
- **AND** sends a minimal ping/heartbeat message to NapCat
- **AND** resets the timer after each heartbeat

#### Scenario: Heartbeat timeout
- **WHEN** no response received within 10 seconds after heartbeat
- **THEN** plugin logs a heartbeat timeout warning
- **AND** closes and re-establishes the connection

### Requirement: Graceful shutdown
The plugin SHALL cleanly close WebSocket connections when the plugin stops.

#### Scenario: Stop all connections on plugin unload
- **WHEN** OpenClaw Gateway stops or unloads the plugin
- **THEN** plugin cancels all heartbeat timers
- **AND** closes all WebSocket connections gracefully
- **AND** waits for close confirmation before returning

#### Scenario: Stop single account on config change
- **WHEN** an account is disabled via config change
- **THEN** plugin cancels that account's heartbeat timer
- **AND** closes that account's WebSocket connection
- **AND** does not affect other active connections

### Requirement: Multi-account connection management
The plugin SHALL maintain separate WebSocket connections for each configured QQ account.

#### Scenario: Multiple accounts active
- **WHEN** multiple accounts are configured and enabled
- **THEN** plugin establishes separate WebSocket for each account
- **AND** maintains independent heartbeat timers per connection
- **AND** routes messages to the correct account based on sender/group ID

#### Scenario: One account fails, others continue
- **WHEN** one account's WebSocket connection fails
- **THEN** plugin isolates the failure to that account
- **AND** continues operating other active connections
- **AND** allows messaging to/from unaffected accounts

### Requirement: Connection status reporting
The plugin SHALL provide current connection status for each account.

#### Scenario: Query connection status
- **WHEN** OpenClaw queries the channel status
- **THEN** plugin returns status for each account
- **AND** includes: connected/connecting/disconnected/failed states
- **AND** includes last connected timestamp and error details if applicable
