# companion-module-streamer-bot

Bitfocus Companion module for two-way communication with [Streamer.bot](https://streamer.bot) over
its WebSocket Server.

Companion drives Streamer.bot (run actions, fire code triggers, send chat messages, read globals),
and Streamer.bot pushes its events back, where they become Companion variables and feedbacks.

## Features

**Companion → Streamer.bot**

- Run an action by id or by name, with JSON arguments that accept Companion variables
- Execute custom code triggers
- Send chat messages to Twitch, YouTube, Kick and Trovo
- Read global and per-user global variables
- Get, test and clear credits
- Connect, disconnect and reconnect; change event subscriptions at runtime
- Send any raw WebSocket request, so new Streamer.bot requests work without a module update

**Streamer.bot → Companion**

- ~70 variables: connection and instance info, per-platform live state, viewer counts, broadcaster
  and bot accounts, and the latest chat message, follower, sub, gift sub, cheer, raid, reward
  redemption, donation, command, custom event and completed action
- Optional counter variable per event type (`event_<source>_<type>`), declared from the connected
  instance's event catalog so a Companion trigger can fire exactly once per matching event
- Streamer.bot global variables mirrored as `$(streamer-bot:global_<name>)`, updated live
- Feedbacks for connection state, stream live state, action enabled state, global variable
  comparisons, and a "recent event" flash
- Presets covering connection control, triggering actions and the latest-activity buttons

See [`companion/HELP.md`](companion/HELP.md) for the full reference — that is also the help text
shown inside Companion.

## Requirements

- Bitfocus Companion 4.3 or later (module API 2.x)
- Streamer.bot 0.2.4 or later, with the WebSocket Server enabled.
  Global variables and the commands list require 0.2.5 or later.

## Setup

In Streamer.bot, open **Servers/Clients → WebSocket Server**, enable the server, and note the
address, port and endpoint (defaults `127.0.0.1`, `8080`, `/`). Enter the same values in the
Companion connection. If authentication is enabled in Streamer.bot, set the password here too —
it is stored in Companion's secrets store, not in the connection config.

The connection tolerates Streamer.bot not being running yet: it retries with a backoff and picks
up automatically once Streamer.bot appears.

## Development

```sh
npm install
npm run build      # compile to dist/
npm run lint       # eslint + prettier
npm run package    # build a .tgz for Companion's developer module folder
```

To load a development build, point Companion's _Developer modules path_ at the folder containing
this repository.

## License

MIT
