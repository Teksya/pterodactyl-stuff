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
- **Download** the console as a `.log` file, **clear** it, show the **time** of each line, wrap
  long lines or not, three text sizes, and **full screen** (Escape leaves it).

Who may see the console and send commands does not change: the panel's own permissions apply.

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
server, behind the panel's `websocket.connect` permission.

| Route (`/api/client/servers/{server}/extensions/console-plus`) | |
| --- | --- |
| `GET /preferences`, `PUT /preferences` | The signed-in user's console preferences for the server |

## Install

```bash
php artisan p:extension:install pterodactyl-console-plus-1.0.0.zip --enable --replace
```

Enabling runs `database/migrations` (table `console_plus_preferences`); no `php artisan migrate`
needed. Requires PHP 8.3.
