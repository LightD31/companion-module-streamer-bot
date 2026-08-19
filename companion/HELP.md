## Streamer.bot

Two-way control of [Streamer.bot](https://streamer.bot) over its WebSocket Server.

Companion can run actions, fire code triggers, send chat messages and read global variables;
Streamer.bot pushes its events back, where they become Companion variables and feedbacks.

### Setting up Streamer.bot

1. In Streamer.bot, open **Servers/Clients → WebSocket Server**.
2. Make sure the server is enabled, and note its **Address**, **Port** and **Endpoint**
   (defaults: `127.0.0.1`, `8080`, `/`).
3. Tick **Auto Start** so the server comes back after a restart.
4. If Companion runs on a different machine, set the address in Streamer.bot to `0.0.0.0`
   and enter the Streamer.bot machine's IP in this connection's config.

If you enable **Authentication** in Streamer.bot, enter the same password in this connection.
Authentication is required for the _Send chat message_ action; everything else works without it.

### Connection settings

| Setting                            | Notes                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Scheme / Address / Port / Endpoint | Must match the Streamer.bot WebSocket Server tab                                       |
| Password                           | Only needed when authentication is enabled in Streamer.bot                             |
| Reconnect automatically            | Retries with a backoff while Streamer.bot is closed, and reconnects when it comes back |
| Subscribe to all events            | Convenient, but a busy chat generates a lot of traffic                                 |
| Event sources                      | The sources to subscribe to when not subscribing to everything                         |
| Log every received event           | Debug aid; writes each event and its payload to the Companion log                      |
| Mirror global variables            | Exposes Streamer.bot globals as `$(streamer-bot:global_<name>)`                        |

The connection stays usable while Streamer.bot is closed: Companion keeps retrying and picks the
connection back up on its own once Streamer.bot is running again.

### Actions

| Action                       | What it does                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Run action                   | Runs a Streamer.bot action, picked from the live list of actions or by id    |
| Run action (by name)         | Same, matched by name — useful when action ids are not stable across imports |
| Execute code trigger         | Fires a custom code trigger registered by a C# action                        |
| Send chat message            | Posts to Twitch, YouTube, Kick or Trovo chat (**requires authentication**)   |
| Read global variable         | Returns the value as the action result                                       |
| Read user global variable    | Per-viewer globals, for one user id                                          |
| Refresh mirrored globals     | Re-reads all global variables                                                |
| Refresh actions and triggers | Re-reads actions, code triggers, commands and broadcaster info               |
| Get / Test / Clear credits   | Drives the Streamer.bot credits system                                       |
| Connection control           | Connect, disconnect or reconnect                                             |
| Change event subscriptions   | Subscribes or unsubscribes at runtime without touching the connection config |
| Send raw request             | Sends any WebSocket request as raw JSON, e.g. `{"request": "GetInfo"}`       |

Actions that take **Arguments** expect a JSON object, and the values support Companion variables:

```json
{ "user": "$(streamer-bot:last_chat_user)", "amount": 5 }
```

Inside Streamer.bot those arrive as regular action arguments (`%user%`, `%amount%`).

Actions marked as returning a result can be chained with Companion's action result flow, so the
returned value can be written to a custom variable or used by a later action.

> Streamer.bot's WebSocket API has no request for _writing_ a global variable. To set one from
> Companion, run an action that does the write and pass the value in as an argument.

### Feedbacks

| Feedback                    | Notes                                                                         |
| --------------------------- | ----------------------------------------------------------------------------- |
| Connection state            | Connected, disconnected or authenticated                                      |
| Stream is live              | Follows the StreamOnline / StreamOffline events of the selected platform      |
| Streamer.bot action enabled | Whether an action is currently enabled in Streamer.bot                        |
| Global variable comparison  | Compares a mirrored global against a value (=, ≠, contains, <, >, ≤, ≥)       |
| Global variable value       | Value feedback, for driving local variables                                   |
| Recent event                | True for a short window after a matching event — good for chat/follow flashes |

_Stream is live_ only knows what it has been told: it starts `false` and flips when the platform
reports going online or offline while the connection is up.

### Variables

Connection: `connected`, `connection_status`, `authenticated`, `sb_name`, `sb_version`,
`sb_instance_id`, `sb_os`, `sb_os_version`, `action_count`, `code_trigger_count`,
`command_count`, `global_count`.

Events: `event_count`, `last_event`, `last_event_source`, `last_event_type`, `last_event_time`.

Per platform (`twitch`, `youtube`, `kick`, `trovo`): `<platform>_live`, `<platform>_viewers`,
`<platform>_broadcaster`, `<platform>_broadcaster_id`, `<platform>_bot`.

Latest activity: `last_chat_user`, `last_chat_message`, `last_chat_user_id`, `last_chat_platform`,
`last_follower`, `last_sub_user`, `last_sub_tier`, `last_sub_months`, `last_gift_sub_user`,
`last_gift_sub_count`, `last_cheer_user`, `last_cheer_bits`, `last_raid_user`, `last_raid_viewers`,
`last_reward_name`, `last_reward_user`, `last_reward_input`, `last_reward_cost`,
`last_donation_user`, `last_donation_amount`, `last_donation_currency`, `last_donation_message`,
`last_command`, `last_command_user`, `last_custom_event`, `last_custom_event_data`,
`last_action_run`, `last_action_completed`.

Mirrored globals appear as `global_<name>`, lowercased with anything outside `a-z 0-9 _ -` replaced
by `_` (so `deathCount` becomes `$(streamer-bot:global_deathcount)`).

A variable only updates if you are subscribed to the event that carries it. Chat and follower
variables need the **Twitch** source; mirrored globals need **Misc**, which is subscribed
automatically whenever global mirroring is on.

### Troubleshooting

**Status stays on "Connecting"** — Streamer.bot is not running, the WebSocket Server is off, or the
address/port do not match. Companion keeps retrying, so simply starting Streamer.bot is enough.

**"Authentication failed"** — the password does not match the one in Streamer.bot's WebSocket
Server tab.

**Chat messages are refused** — _Send chat message_ is a privileged request. Enable authentication
in Streamer.bot and set the password here.

**Action dropdowns are empty** — the lists are read on connect. Use _Refresh actions and triggers_
after adding actions in Streamer.bot. Every dropdown also accepts a typed-in id or name.

**Nothing updates** — check the event sources in the connection config, and turn on
_Log every received event_ to see what is actually arriving.
