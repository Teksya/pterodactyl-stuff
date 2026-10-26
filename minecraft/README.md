# Minecraft

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT: a toolkit for Minecraft servers that needs no
setup on the server (no plugin; RCON optional, for faster live data). On servers whose egg carries the `minecraft` tag (every
Minecraft egg the panel ships), it adds three pages to the server's navigation: **Players**,
**Worlds** and **Properties**.

## Players

Laid out as the [Minecraft Player Manager](https://hub.pelican.dev/plugins/rbs-minecraft-player-manager)
plugin for Pelican does it, with the panel's own tools added.

**Player List.** At the top, the server's **Online Players** out of the maximum, its **MOTD** and its
**Map Name** (the world folder). Then **Message all**, **Add by name** (to the whitelist, the
operators or the bans) and, under **⋯**, the **banned addresses** and RCON. Tabs with their counts,
*All*, *Online*, *Offline*, *OP*, *Banned*, and a search, over a table of everyone the server knows
(the world's player files, the name cache and the lists): skin's face, username and when they were
last seen, status (*Online*, *Offline* or *Banned*), operator, and the row's actions: **View**,
**OP**/**DEOP**, **Kick** and **Ban**/**Unban**, each asking first.

**View Player**, in sections:

- **Identity**: username, current status, UUID; operator level, whitelisted, banned and why.
- **Statistics**: play time, distance walked, mobs killed, deaths; **All statistics** opens the rest
  (player kills, blocks mined, items crafted, jumps, damage, times joined, every distance, the
  blocks mined most, the mobs killed and what killed them).
- **Status**: health as hearts and food as shanks, XP level, game mode, dimension, position and
  active effects, and where they come from (live, RCON off, offline).
- **Inventory**: off hand, the 27 slots over the hotbar, the armour; each item with its picture,
  count and wear, and on hover its name, enchantments and durability. **Drag** an item to move it,
  **right-click** it to take it out, **click an empty slot** to give an item there, picked from the
  server's version's list of items (or any id, for mods' items).
- **Ender Chest**.
- **Management**: the plugin's **OP**/**DEOP**, **Clear Inv**, **Kick** and **Ban**/**Unban** (with
  its prefilled reasons), then message (in the chat or as a title), teleport (to a player or to
  coordinates in a dimension), game mode, effects, heal, feed, give an item, experience, whitelist
  and kill.

**Online, actions are console commands; offline, they edit the player's file.** A player who is
away gets their game mode, health, food, place, items, effects and levels changed in
`world/playerdata/<uuid>.dat`, and finds them when they join. Messages, effects, kicks and kills
need the player online. The lists (operators, whitelist, bans) go through the console while the
server runs and are edited as files while it is stopped.

**A player who is online is read live over RCON, as the plugin does**, from 1.13: one
`data get entity <name> <field>` per field (health, inventory, ender chest, effects…) on one
connection, each answered at once (long answers, an inventory, in several packets, all read), and
nothing in the console. The page reads them again every 3 seconds while they play (every 15 from
their file without RCON), and **Refresh** at once. Without RCON, or before 1.13, the page shows
the player as the server last saved them, and says so. The panel tries the RCON port's allocation
address, the node's FQDN, then `127.0.0.1` and `localhost`, remembers the one that answered, and
leaves RCON for a minute when none does.

**⋯ → Faster live data (RCON)…** (or **Turn on RCON** in a player's Status) turns it on, on one of
the server's allocation ports the game does not use, with a new random password; it starts with
the server's next start. Without a free allocation, add one in the Network tab first. The actions
that need an online player's inventory (moving an item, giving one into a slot) still read it back
from the console when RCON is off.

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

The panel asks the game the way the multiplayer screen does (the server list ping), which names
up to twelve players. Beyond twelve, or when the server hides its players, it runs `list` in the
console and reads the answer (chat lines that look like it are ignored). The ping goes to the main
allocation's address; for an allocation on every address (`0.0.0.0`) it goes to the node's FQDN, or
to **Server address for the status ping** in Admin → Extensions → Minecraft.

The panel changes a player's file only when it knows they are away: never while the server starts
or stops (it saves its players then), nor when it could not name everyone online. The lists' files
are written only while the server is stopped, and a list file that cannot be read is never
overwritten.

## Worlds

**Active world**: what its `level.dat` says (name, version, seed a click copies, spawn, weather,
time of day, hardcore); while the server runs, weather, time, difficulty, saving the world, and
**every game rule**, on or off or set to a number, through the console.

**Worlds & snapshots**:

- **Worlds**: every world in the server's folder (each folder with a `level.dat`), with its
  Nether and End folders on Bukkit-based servers, its version and when it was last played. Make
  another one the world loaded at the next start, create a new one (folder, seed, type), or delete
  one that is not active.
- **Snapshots**: a copy of a world (with its Nether and End) kept in the server's `.snapshots`
  folder. **Take a snapshot** while the server runs: autosaving pauses and the world is flushed to
  disk while it is copied, so the copy is whole. **Restore** in one click: the server stops, the
  current worlds are set aside (renamed), the snapshot is extracted, and only then are the worlds
  set aside deleted; if the extraction fails they are put back. The server starts again if it was
  running. By default a snapshot of the worlds as they were is kept first, so a restore can be
  undone. Snapshots download as `.tar.gz`, and the page follows each one with a progress bar, even
  after a reload. If Wings times out while extracting a large world, it may still be at it: the old
  worlds then stay aside as `world.before-restore-<date>`, and the page says so.
- **Automatic snapshots**: every hour, 3, 6 or 12 hours, day, two days or week, keeping the last
  ones (the oldest automatic snapshots are deleted).

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
php artisan p:extension:install pterodactyl-minecraft-1.0.0.zip --enable --replace
```

The server icon needs PHP's GD extension, which the panel already requires.

## Files

| File | Purpose |
| --- | --- |
| `extension.json` | Manifest: the three screens, shown on servers tagged `minecraft` |
| `src/MinecraftProvider.php` | Routes, the three permissions, the settings, the snapshot schedule |
| `src/Nbt/` | Binary NBT, read and written with every tag's type |
| `src/Server/` | The server's files, console, RCON connection, status ping and `server.properties` |
| `src/Rcon/` | The RCON protocol client |
| `src/Players/` | Players, their files and statistics, the lists, the commands of each version, the world |
| `src/Worlds/`, `src/Jobs/`, `src/Models/` | Worlds, snapshots, their queued jobs and their tables |
| `database/migrations/` | The snapshots and schedules tables |
| `src/Http/` | The API under `/api/client/servers/{server}/extensions/minecraft` |
| `src/client/players/` | The Players page: list, player, inventory, actions, item picker, statistics |
| `src/client/world/`, `src/client/properties/` | The Worlds and Properties pages |
| `src/client/minecraft.spec.tsx` | Tests of the pages, run with the SDK's real runtime |
| `tests/run.php` | Tests of the NBT, player files, commands, statistics, console answers and the RCON protocol: `php tests/run.php` |
| `tests/actions.php` | Tests of the actions and worlds on a stand-in server, stopped, starting and running: `php tests/actions.php` |
| `tests/snapshots.php` | Tests of snapshots and restores, failed and timed-out extractions included: `php tests/snapshots.php` |
| `tests/stubs.php` | The stand-ins for the panel's classes those tests use |
