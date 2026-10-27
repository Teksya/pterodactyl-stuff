# Console Plus

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT. It replaces the server console's terminal
with a console you can read, search and select like text.

The console stays as plain as the panel's: the toolbar (search, level filter, error and warning
counts, display options, rules, download, clear, full screen) opens with **Ctrl+F** in the
console, or the small search button at its top right, and Escape closes it. *Always show this
bar*, in its display options, keeps it open. A level filter still in force with the bar closed is
named on that button.

- **Search** the output (Ctrl+F in the console): every match highlighted, Enter and Shift+Enter
  (or the arrows) go from one to the next, `/like this/` searches with a regular expression.
- **Levels**: errors and warnings are tinted and counted. A click on *3 errors* or *12 warnings*
  shows only those; *Show* switches between everything, warnings and errors, or errors.
- **Colours**: ANSI colours (16, 256 and true colour, bold, italic, underline) and Minecraft's
  `§` codes.
- **Stack traces fold** under their first line ("23 trace lines", a click opens them), and the
  same line repeated in a row shows once with a count.
- **Hide the noise**: lines containing a text (or matching a `/regex/`) are hidden. **Highlight**
  words wherever they appear, such as player names.
- **Clickable**: web links open in a new tab; server files (`config/…`, `logs/latest.log`,
  `server.properties`…) open in the file editor.
- **Commands**: the history is saved (the arrow keys and a menu bring it back, on every device),
  and **favourite commands** are buttons above the command line (the star adds the one typed).
- **Completion**: the game's commands are suggested as you type them, then their words and values
  (see below).
- **Download** the console as a `.log` file, **clear** it, show the **time** of each line, wrap
  long lines or not, three text sizes, and **full screen** (Escape leaves it).

Who may see the console and send commands does not change: the panel's own permissions apply.

## Command completion

The command line suggests the commands of the server's game as you type: the commands that start
with what is typed, then each command's words and the values of its arguments. Under the list, the
**usage** of the command being typed shows where you are in it, the argument being typed in bold
(`KickPlayer <SteamID>`, `give <targets> <item> [count]`), with what the command does. A command
typed whole that needs more (`kickplayer`) shows what comes after it at once; taking a suggestion
then writes both, in the command's own case (`KickPlayer 76561198000000011`). The commands sent
before that start with the line come first.

- **Tab** takes the suggestion picked, or the first; **Enter** takes the one picked (the first is,
  while a word is typed) and sends the line when nothing is, or the word is already whole. The
  **arrows** go through the suggestions, **Escape** hides them, **Ctrl+Space** shows them again.
  While no suggestion shows, the arrows bring back the history as before.
- **Players** come from the console: who joined and left, and the answers to `list`, `status` or
  `ListPlayers`, those online first. An argument that takes a **Steam id** (`KickPlayer`, `banid`,
  `kickid`, Rust's `banid`, `ownerid`…) offers the ids the console showed, each with its player's
  name and whether they are online; one that takes a name offers the names. Minecraft adds the
  selectors (`@a`, `@p`…) with what each picks.
- **Other values**: items, blocks, entities, effects, enchantments, biomes and particles of the
  Minecraft version; game modes, difficulties, game rules, weather; maps (the current one marked);
  Rust items; FiveM resources. Coordinates offer `~ ~ ~`.
- The game comes from the server's egg: its name, its tags and a few of its variables (a version,
  a Source game, Rust's framework). A leading `/` is fine.

| Egg | Commands |
| --- | --- |
| Vanilla Minecraft, Paper, Forge, Sponge (and Spigot, Purpur, Fabric, NeoForge…) | Java Edition's commands **of the version the server runs**, 1.8 to 26.x: the one it prints when it starts, else the egg's version variable, else the latest. Paper adds Bukkit's, Spigot's and Paper's (`plugins`, `tps`, `mspt`, `paper`, `spark`), Forge `forge`, Sponge `sponge`. |
| BungeeCord (and Waterfall, Velocity) | The proxy's own (`alert`, `send`, `glist`, `end`…) |
| Minecraft: Bedrock | Bedrock Dedicated Server's |
| Garry's Mod, Counter-Strike 2 / Global Offensive, Team Fortress 2, Insurgency, Custom Source Engine Game | The Source server's (`status`, `changelevel`, `kick`, `exec`…), Metamod's and SourceMod's, and each game's own (`lua_run`, `mp_*`, `bot_*`, `tf_bot_*`…), with its maps |
| ARK: Survival Evolved | The admin commands its egg sends over RCON (`ListPlayers`, `SaveWorld`, `Broadcast`…) |
| Rust | The server's (`status`, `kick`, `inventory.giveto`, `server.*`, `weather.*`…), Oxide's or Carbon's by the egg's framework |
| Terraria, tShock, FiveM | Their consoles' |
| Teamspeak3, Mumble | None: these servers read no commands from the console. |

Minecraft's commands from 1.13 come from the game's own command tree, as
[PrismarineJS/minecraft-data](https://github.com/PrismarineJS/minecraft-data) holds it for each
version, with the names of its items, blocks and so on; `scripts/minecraft-data.py` builds
`src/client/completion/minecraft.json` from it. Earlier commands are written by hand. Minecraft's
data loads only for a Minecraft server.

## Cards and graphs

The console page's cards and graphs are reworked too:

- **Cards**: CPU, memory and disk with a meter against the server's limit (tinted from 80%),
  the uptime with the time the server started, and the network **as it flows now** (per second)
  with its totals beside it.
- **Graphs**: CPU, memory, disk and network (in and out, per second), over **1 minute,
  5 minutes, 15 minutes or 1 hour**. Each shows its current, average and peak value over the
  range and the server's limit as a dashed line; the pointer gives the exact time and values.
  **Pause** freezes them to read them; a graph opens **larger** across the page.
- The history comes from the readings Wings sends the console (about every two seconds) and is
  kept in the tab, across reloads, for an hour; nothing is stored on the panel.
- *The panel's own cards and graphs*, in the console's display options, brings back the
  originals.

## How it works

The extension overrides the `server.terminal` view. It shows the last 100 lines Wings holds
(`serverLogsQueryOptions`), then what the server websocket sends, as the panel's terminal does:
the output, power state changes, daemon messages and errors, install and transfer output. The
console keeps the last 5,000 lines in memory. The command line is the panel's: the extension
calls its `setValue` and `submit`.

Each user's preferences for a server (favourites, the last 100 commands, hide and highlight
rules, display options) are one row of `console_plus_preferences`, deleted with the user or the
server, behind the panel's `websocket.connect` permission, as is what the completion asks of the
server's game.

| Route (`/api/client/servers/{server}/extensions/console-plus`) | |
| --- | --- |
| `GET /preferences`, `PUT /preferences` | The signed-in user's console preferences for the server |
| `GET /game` | The server's egg name and tags, and the variables that name its game's version, Source game or Rust framework (never a password or a token) |

## Install

```bash
php artisan p:extension:install pterodactyl-console-plus-1.1.0.zip --enable --replace
```

Enabling runs `database/migrations` (table `console_plus_preferences`); no `php artisan migrate`
needed. Requires PHP 8.3.

`tests/run.php` checks what `GET /game` sends (`php tests/run.php`); the client's tests run with
`npm test` in a panel checkout.
