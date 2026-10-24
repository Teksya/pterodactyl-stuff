# Admin Sidebar

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT. It organises the admin area's navigation in
folders that fold, and gathers the pages extensions add under **Extensions**.

- **Ready to use**: Overview and Activity on top, then the folders *Servers* (servers, nodes,
  locations, database hosts, mounts), *Users* (users, API keys), *Eggs* (eggs, tags), *Panel*
  (settings, themes, extensions) and *Extensions*, where every page an extension adds goes on its
  own, including the ones installed later.
- **Folders fold**: a click on a folder's heading folds it; the folder of the page in view stays
  open. Each administrator's folded folders are kept in their browser.
- **Admin → Sidebar** arranges it for every administrator: create, rename, reorder and delete
  folders, and drag pages between them (or move them from their menu), with the sidebar itself
  as the preview. *Reset* goes back to the defaults.

With **Nightfall** 1.2 or later, the theme's sidebar draws the folders and folds them. With the
default (classic) look, the extension draws the admin sidebar itself, with the same folders.
Other themes receive the pages in order with their folder as their `group`, and draw it their
own way.

## How it works

The extension overrides `layout.app` and `layout.admin`: in the admin area, it hands the layer
below the navigation reordered, each item's `group` set to its folder, through `Default`'s
`model`. Nothing else changes: links, permissions, badges and the navigation slots are the
panel's.

Items are known by a key: `core:<path>` for the panel's pages (`core:nodes`), `ext:<extension>:<screen>`
for an extension's. The arrangement is one row of `admin_sidebar_layouts`.

| Route (`/api/admin/extensions/admin-sidebar`) | |
| --- | --- |
| `GET /layout` | The arrangement, or `null` for the defaults |
| `PUT /layout` | Save it (folders, placements, order) |
| `DELETE /layout` | Back to the defaults |

## Install

```bash
php artisan p:extension:install pterodactyl-admin-sidebar-1.0.0.zip --enable --replace
```

Enabling runs `database/migrations` (table `admin_sidebar_layouts`); no `php artisan migrate`
needed. Requires PHP 8.3.
