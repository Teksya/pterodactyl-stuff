# Minecraft

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT: a toolkit for Minecraft servers, with no
plugin on the server. On servers whose egg carries the `minecraft` tag (every Minecraft egg the
panel ships), it adds three pages to the server's navigation: **Players**, **Worlds** and
**Properties**.

## How the panel talks to the server

Two ways, each for one thing:

- **Actions are commands** typed in the server's console (kick, ban, op, teleport, heal, give,
  game mode, weather, time, game rules, messages…). A command needs no answer: the panel types it
  and the server runs it. The panel never reads the console back.
- **What the panel reads from a running server comes over RCON**, and from nowhere else: who is
  online (`list uuids`), an online player's health, inventory and ender chest (`data get entity`),
  the time, the weather and the game rules, and the save that comes before a snapshot
  (`save-all flush`, whose answer says the world is on disk). Without RCON, the panel does not
  guess: it shows what needs RCON, with a button to turn it on.

The panel reads the answers of the vanilla commands. On Paper, Spigot and the other Bukkit-family
servers, a plugin can take a command's name and answer in its own words (EssentialsX takes `list`
and `time`); the vanilla command keeps the name `minecraft:<name>` there. So who is online and the
time are asked under both names, `minecraft:list uuids` and `list uuids`, `minecraft:time query
daytime` and `time query daytime`, on one connection, and the vanilla answer counts; the other
servers (vanilla, Fabric, Forge) answer that they do not know the first name.

Files are read where they are the truth: everything while the server is stopped, and while it runs,
the lists (the server writes them at each change), the name cache, statistics, and the file of a
player RCON says is offline. While nobody can say who is online (no RCON, or the server starting or
stopping), a player's page shows their last save, says it is one, and changes nothing in it.

## Players

Laid out as the [Minecraft Player Manager](https://hub.pelican.dev/plugins/rbs-minecraft-player-manager)
plugin for Pelican does it, with the panel's own tools added.

**Player List.** At the top, the server's **Online Players** out of the maximum, its **MOTD** and its
**Map Name** (the world folder). Then **Message all**, **Add by name** (to the whitelist, the
operators or the bans) and, under **⋯**, the **banned addresses** and RCON. Tabs with their counts,
*All*, *Online*, *Offline*, *OP*, *Banned*, and a search, over a table of everyone the server knows
(the world's player files, the name cache and the lists): skin's face, username and when they were
last seen, status (*Online*, *Offline* or *Banned*), operator, and the row's actions: **View**,
**OP**/**DEOP**, **Kick** and **Ban**/**Unban**, each asking first. While the server runs without
RCON, who is online is unknown: no count, no *Online* or *Offline* tab, and a notice that says why.

**View Player**, in sections:

- **Identity**: username, current status, UUID; operator level, whitelisted, banned and why.
- **Statistics**: play time, distance walked, mobs killed, deaths; **All statistics** opens the rest
  (player kills, blocks mined, items crafted, jumps, damage, times joined, every distance, the
  blocks mined most, the mobs killed and what killed them).
- **Status**: health as hearts and food as shanks, XP level, game mode, dimension, position and
  active effects, and where they come from (live over RCON, the save of a player who is offline, or
  their last save when the panel cannot say whether they play), with when that save was written:
  the server writes it every few minutes and when the player leaves.
- **Inventory**: off hand, the 27 slots over the hotbar, the armour; each item with its picture,
  count and wear, and on hover its name, enchantments and durability. **Drag** an item to move it,
  **right-click** it to take it out, **click an empty slot** to give an item there, picked from the
  server's version's list of items (or any id, for mods' items).
- **Ender Chest**.
- **Management**: the plugin's **OP**/**DEOP**, **Clear Inv**, **Kick** and **Ban**/**Unban** (with
  its prefilled reasons), then message (in the chat or as a title), teleport (to a player or to
  coordinates in a dimension), game mode, effects, heal, feed, give an item, experience, whitelist
  and kill.

**While the server runs, actions are commands**, typed in the console, the toast showing the
command sent. A player RCON says is offline has their file changed instead (game mode, health,
food, place, items, effects, levels in `world/playerdata/<uuid>.dat`), which the server does not
hold, and finds it when they join. Messages, effects, kicks and kills need the player online.
Without RCON nobody can say whether a player is online: an action is a command then, and the toast
says that it acts only if they are (the console answers whether it found them; the panel does not
read it).
While the server is stopped, every change goes to the files; the lists (operators, whitelist,
bans) are edited as files then, and through commands while it runs. Putting an item into a slot
of a player who is online (moving one, or giving one there) asks RCON first about that slot alone
(`data get entity <name> Inventory[{Slot:5b}]`) that it is empty, since a command replaces what is
there; empty means the server answered "Found no elements matching" that very path. The command
checks again (`execute unless items …`), and a move empties the source only once the item is in
the target (`execute if items …`): the game refuses some (a block in the chest armour slot).

On a server that answered `minecraft:list`, every command is typed by the vanilla command's name
(`minecraft:item`, `minecraft:give`, and the one `execute` runs): a plugin that took a name
(EssentialsX's `/item` refuses the console, its `/give` reads items its own way) does not get them.
A name that commands cannot name (offline mode lets in `Bob!`) shows the player's page with that
reason instead of their live state.

**A player who is online is read over RCON, as the plugin does**, from 1.13: one
`data get entity <name> <field>` per field (health, inventory, ender chest, effects, the maximum
health) on one connection, each answered at once (long answers, an inventory, in several packets,
all read), and as `minecraft:data` on a server that answered `minecraft:list`. The page reads them
again every 3 seconds while they play, looks again every 10 seconds while the server runs (for
players joining and leaving, or RCON coming up), and **Refresh** reads at once.

Some servers cut long answers short (a plugin does; the answer then ends in `...`). An inventory,
an ender chest, what is worn or the effects that come back so are asked again in parts, on the same
connection: each item or effect alone, in order until the first one missing (`Inventory[3]`), and
an item still too long value by value (its id, count, slot, name, enchantments and wear), so that
every answer stays short.
A field the player does not have (no effects, nothing worn) is empty; a value too long even alone
(a very long name), or an answer the panel cannot read, is named on the page with the reason,
rather than missing silently.
Before 1.13 the server cannot be asked about a player: the page shows their last save, and says
so.

**RCON is spared**: each connection is a line in the server's console. A request asks all its
questions on one connection, closed when it ends; who is online is kept 5 seconds for every page
and viewer of a server (an action asks afresh). The panel connects to the RCON port's allocation
address and alias, the node's FQDN, then `127.0.0.1`, remembers the one that answered, and waits a
minute before trying again when trying kept it waiting, or the server refused the password; a
server that refuses at once (nothing listens yet, as right after RCON was turned on) is asked again
at the next request. However slowly a server answers, one answer is read within its wait and 5
seconds more, and never past 2 MB: a server cannot hold the panel.

**⋯ → Turn on RCON…** (or **Turn on RCON…** in any notice that needs it) turns it on, on one of the
server's allocation ports the game does not use; it starts with the server's next start, and the
notice offers to restart when RCON is on but does not answer yet. When server.properties already has
an RCON password, the dialog asks whether to keep it (the default) or replace it with a new random
one; without one, it writes a random one. Without a free allocation, add one in the Network tab
first.

Every version works, from 1.8 to 26.x. Each file is looked for where the world keeps it: player
files in `playerdata` and `stats` until 1.21.11 and in `players/data` and `players/stats` from 26.1,
the game rules, weather and seed in `level.dat` until 1.21.11 and in `data/minecraft/*.dat` from
26.1. Binary files (player files, `level.dat`) are read through Wings' download, as the file
manager downloads them. Likewise the commands (`effect`, `xp`, `replaceitem` before 1.17,
`item` after) and the files (item counts and ids before and after 1.13 and 1.20.5, armour in
`equipment` from 1.21.5) follow the world's version, read from its `level.dat`. Moving an item of a
player who is online takes 1.17 or later, and only to an empty slot: the console cannot swap two
items.

### Who is online

`list uuids` over RCON names everyone online, with their UUIDs (the names alone on versions that
list no UUIDs, matched by name then), asked as `minecraft:list uuids` too for a server where a
plugin took `list` (asked first; `list uuids` only when it does not answer as the game does). Each
player is found by their UUID, whatever their name (offline mode lets in `Bob!` or `Ann.`). When
`list` counts more players than the panel could read, or the server cut the answer short, the
others stay unknown rather than offline. Stopped, the server has nobody online. Starting, stopping, or
running without RCON, nobody is taken for online or offline: each player's page shows their last
save, read-only, and says so.

The panel changes a player's file only when it knows they are away: the server is stopped, or RCON
says so; never while the server starts or stops (it saves its players then). The lists' files are
written only while the server is stopped, and a list file that cannot be read is never
overwritten.

## Worlds

**Active world**: its name, version, seed (a click copies it), spawn and hardcore from its save.
While the server runs, its **time of day**, **weather** (from 1.20.5, which can test it) and
**every game rule** come over RCON, read again every 10 seconds; set the weather, the time, the
difficulty, save the world, and switch or set each rule, by command. Without RCON these values are
not shown while the server runs, rather than as they were last saved. Stopped, the save is the
truth: everything comes from it.

**Worlds & snapshots**:

- **Worlds**: every world in the server's folder (each folder with a `level.dat`), with its
  Nether and End folders on Bukkit-based servers, its version and when it was last played. Make
  another one the world loaded at the next start, create a new one (folder, seed, type), or delete
  one that is not active.
- **Snapshots**: a copy of a world (with its Nether and End) kept in the server's `.snapshots`
  folder. **Take a snapshot** while the server runs: RCON turns autosaving off and has the world
  written to disk (`save-all flush`), the panel waits for that answer, copies the world, then RCON
  turns autosaving back on (the console if RCON fails by then), so the copy is whole. A running
  server without RCON is not
  snapshot (stopped, it needs nothing). **Restore** in one click: the server stops, the
  current worlds are set aside (renamed), the snapshot is extracted, and only then are the worlds
  set aside deleted; if the extraction fails they are put back. The server starts again if it was
  running. By default a snapshot of the worlds as they were is kept first, so a restore can be
  undone. Snapshots download as `.tar.gz`, and the page follows each one with a progress bar, even
  after a reload. If Wings times out while extracting a large world, it may still be at it: the old
  worlds then stay aside as `world.before-restore-<date>`, and the page says so.
- **Automatic snapshots**: every hour, 3, 6 or 12 hours, day, two days or week, keeping the last
  ones (the oldest automatic snapshots are deleted). One that fails (a running server without RCON,
  a server starting) is tried again within the hour, and the Snapshots tab says why it failed until
  one is taken. RCON turns autosave back on after a snapshot; a world the server already had without
  autosave (a map meant to be reset) stays without it.

Snapshots and restores run in the panel's queue, one at a time per server; the panel's queue
worker and scheduler must be running, as for the panel's own backups. They count towards the
server's disk space. In Admin → Extensions → Minecraft → Snapshots: how many snapshots users take
by hand per server (10), and how many automatic ones are kept by default (5).

## Properties

`server.properties` as forms, in sections (General, World, Players, Network, RCON, Resource pack),
each key with what it does. The message of the day has a preview of the server list and buttons for
the `§` colour codes; **Change the icon** turns any picture into a 64 × 64 `server-icon.png`. Only
the keys you change are rewritten; the others, comments included, stay as they are. *Review and
save* lists each change before writing, then offers to restart.

## Skins and item pictures

Skins come from mc-heads.net, items' pictures from mc.nerothe.com and mcasset.cloud, and the list
of items from minecraft-data on jsDelivr. The browser loads them; nothing of Mojang's is bundled.
Turn **Skins and item pictures** off in Admin → Extensions → Minecraft for no outside request: the
page then shows generated avatars and items' names, and the item picker takes typed ids.

## Permissions

| Permission | Gives |
| --- | --- |
| `ext.minecraft.read` | The Players and Worlds pages: players, inventories, statistics, the worlds and their snapshots. |
| `ext.minecraft.manage` | Every action on players, the lists, and the world's weather, time and rules. |
| `ext.minecraft.worlds` | Taking, restoring and deleting snapshots, and switching, creating and deleting worlds. Restoring also takes `control.stop` and `control.start`, deleting a world `file.delete`, downloading a snapshot `file.read`. |
| `file.read`, `file.update` | Reading and saving the Properties page, and the server icon. |

Every action is written to the server's activity log (`server:minecraft.player.kick`,
`server:minecraft.world.weather`, …) with the command it ran. No typed text becomes a command: each
action builds its command from checked values (player names, item ids, numbers within the game's
limits, one line of text).

## Install

Upload `pterodactyl-minecraft-<version>.zip` in Admin → Extensions, or on the panel host:

```bash
php artisan p:extension:install pterodactyl-minecraft-1.2.0.zip --enable --replace
```

The server icon needs PHP's GD extension, which the panel already requires.

## Files

| File | Purpose |
| --- | --- |
| `extension.json` | Manifest: the three screens, shown on servers tagged `minecraft` |
| `src/MinecraftProvider.php` | Routes, the three permissions, the settings, the snapshot schedule |
| `src/Nbt/` | Binary NBT, read and written with every tag's type |
| `src/Server/` | The server's files, its console (commands) and RCON (questions), and `server.properties` |
| `src/Rcon/` | The RCON protocol client |
| `src/Players/` | Players, their files and statistics, the lists, the commands of each version, the world |
| `src/Worlds/`, `src/Jobs/`, `src/Models/` | Worlds, snapshots, their queued jobs and their tables |
| `database/migrations/` | The snapshots and schedules tables |
| `src/Http/` | The API under `/api/client/servers/{server}/extensions/minecraft` |
| `src/client/players/` | The Players page: list, player, inventory, actions, item picker, statistics |
| `src/client/world/`, `src/client/properties/` | The Worlds and Properties pages |
| `src/client/minecraft.spec.tsx` | Tests of the pages, run with the SDK's real runtime |
| `tests/run.php` | Tests of the NBT, player files, commands, statistics, the answers of `list` and the RCON protocol: `php tests/run.php` |
| `tests/actions.php` | Tests of the actions, players and worlds on a stand-in server, stopped, starting, and running with RCON and without: `php tests/actions.php` |
| `tests/snapshots.php` | Tests of snapshots and restores, the save over RCON and failed and timed-out extractions included: `php tests/snapshots.php` |
| `tests/stubs.php` | The stand-ins for the panel's classes those tests use |
