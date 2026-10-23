# Server Organizer

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT. Each user organises the dashboard's server
list their own way, and finds it the same on every device.

- **Folders.** Create, rename, reorder, fold and delete folders. Drag a server onto a folder, or
  use the server's **⋯** menu to move it (from the keyboard or a phone). Servers in no folder sit
  under *Other servers*.
- **Group by** folders, node, location, egg, owner (yours / shared with you), or not at all.
  Every group folds, and stays folded.
- **Show** my servers (owned and shared), only the ones I own, only the ones shared with me;
  root administrators also get other users' servers, or every server.
- **Sort by** name (numbers in order: *Lobby 2* before *Lobby 10*), creation date, or **my order**:
  drag a server onto another to put it before it. Dropping one inside a folder's list also moves
  it into that folder.
- **Search** by name, description, identifier, node, location or egg.

Day to day the list stays clean: search and folding only. **Arrange** shows the Show, Group and
Sort menus, *New folder*, the folder and server menus and dragging; **Done** hides them again.

The servers keep the panel's own cards (state, usage, address, power buttons) and every slot the
panel's list renders, so the active theme (Nightfall, for instance) and other extensions that add
to the cards keep working.

## How it works

The extension replaces the `dashboard.serverList` view. It lists every server of the chosen kind
through the panel's client API (all its pages at once) and asks its own endpoint for what that
API leaves out: each server's node id, location and egg.

| Route (`/api/client/extensions/server-organizer`) | |
| --- | --- |
| `GET /layout`, `PUT /layout` | The signed-in user's folders, placements, order and view choices |
| `GET /servers?type=` | Node, location and egg of the servers the client API lists for `type` (`admin` and `admin-all` for root administrators) |

Each user's layout is one row of `server_organizer_layouts`, deleted with the user. It holds at
most 100 folders and 5,000 placed servers; folder names are 1 to 50 characters. A layout saved
by a user who is no longer a root administrator falls back to their own servers.

Past 2,000 servers in a view, the dashboard shows the panel's own paginated list for it, with a
link back to your own servers. If the extension's API cannot be reached, the panel's list shows
too.

## Install

```bash
php artisan p:extension:install pterodactyl-server-organizer-1.0.0.zip --enable --replace
```

Enabling runs `database/migrations` (table `server_organizer_layouts`); no `php artisan migrate`
needed. Requires PHP 8.3.
