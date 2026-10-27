# File Pages

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT. The file manager shows every file of a
folder, in pages, instead of stopping at the first 250 with "This directory is too large to
display in the browser".

- **Pages** of 50, 100, 250, 500 or 1,000 entries, or **all** of them on one page; the browser
  keeps the size. The range shown and the pages sit above the list and again below it; turning the
  page from below brings the top of the list back into view.
- **Filter this folder**: the entries whose name holds what is typed, in any case, across the
  whole folder, with how many match.
- Directories first, then files, by name, as the panel orders them.
- **Any file** can be opened, selected, renamed, moved, deleted, archived, extracted or have its
  permissions changed, those past the 250th included. A new page, page size or filter starts with
  nothing selected, as the toolbar's checkbox selects the page shown.

Every folder shows the filter and how many entries it holds; the page buttons show once there is
more than one page.

## How it works

The panel already fetches every entry of a folder; its file manager then keeps the first 250. The
extension replaces two views, `server.files.manager` and `server.files.manager.list`. The first
builds the entries from the whole listing the way the panel does, and hands the panel's own
manager one page of them, with a selection and an `open` that know every entry. The second puts
the filter and the pages around the panel's list.

The rows, their menus and the toolbar stay the panel's (or the active theme's, Nightfall's for
instance), as do the permissions: nothing is fetched or allowed beyond what the panel does. The
extension has no server part and no settings.

## Install

```bash
php artisan p:extension:install pterodactyl-file-pages-1.0.0.zip --enable --replace
```
