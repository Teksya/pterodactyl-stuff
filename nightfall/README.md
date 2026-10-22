# Nightfall

A Pterodactyl Panel 2.0 theme by Olivier DUTOIT. It gives the whole panel a modern look over
classic's pages: a near-black (or light) palette, a sidebar that holds every navigation, softer
components, and a split-screen sign-in.

## What you get

- **A sidebar** on wide screens with the brand, the server search, the navigation of the area you
  are in first (a server with its name and state, the account, or the administration, with its
  groups), then the main links (dashboard, admin, account) at its foot, which fold away behind their
  "Panel" heading (the choice is kept in the browser), and your account, the scheme menu and
  sign-out at the bottom. The round button on its edge folds it into a rail of icons (their names
  as tooltips), the Pterodactyl mark or logo, the server's initial with its state, and the avatar;
  the browser keeps the choice. On phones and narrow windows it becomes a drawer behind a menu
  button; Escape or a link closes it.
- **Dark and light schemes**. Dark is near black instead of classic's slate; each user picks
  dark, light or system in the sidebar. The console and the file editor stay dark in both.
- **Softer components** for the whole UI kit, so every page and every extension built with it
  follows: rounded buttons with sentence-case labels, rounded inputs with a soft focus ring, file fields with a primary button, cards,
  dialogs, menus, tooltips, badges, checkboxes, tables, stats and charts with larger corners and
  quieter frames, and icon badges on server rows and empty states. The file manager's rows and the
  activity log's entries sit in one card each, with hairlines between them. Spinners are a thin
  ring with a primary arc; the loading bar along the top of the page stays classic's.
- **The search** as a field in the sidebar (with its shortcut) that opens a restyled dialog.
- **The sign-in pages** (login, forgot password, reset password, two-factor checkpoint) on a split
  screen: the brand on a gradient half, the form on the other, with icons in the fields, a show /
  hide button for passwords, and a large monospaced input for the authenticator code. The reset page
  keeps the account's email in a read-only `username` field for password managers.
- A short entrance animation on the sign-in pages, turned off for visitors who ask for reduced motion.

Everything else stays the panel's: data, permissions, routing, requests, validation, notifications
and the page content itself. The layers submit through the models the panel hands them and spread
each field's own props onto its input.

### Settings

On **Admin > Themes**, Nightfall's settings are:

| Setting | |
| --- | --- |
| Primary colour | Buttons, links, the active sidebar item, the start of the sign-in gradient |
| Accent colour | Highlights and the end of the sign-in gradient |
| Logo | An image shown in the sidebar and on the sign-in pages in place of the panel's name |
| Sign-in tagline | The large text of the sign-in brand half |
| Sign-in subtitle | The line under it; leave it empty to hide it |

### Extensions

Every slot the classic layouts and pages render is still rendered, so extensions keep working:
`nav.items.before` / `.after` around the main links, the server, account and admin navigation slots
around each area's items in the sidebar, and `auth.login.form.after` inside the login form, under
the Sign in button (where the Cloudflare Turnstile extension shows its widget). reCAPTCHA renders
inside each sign-in form that uses it.

## Why a theme

The sign-in pages are shown to visitors who are not signed in, and the panel does not send an
ordinary extension's view overrides to them, so only the active theme can redraw them. Nightfall is a
theme (`"type": "theme"`) that extends classic: every page it leaves out is classic's, in Nightfall's
frame and skins.

Only one theme is active at a time. To build Nightfall on another theme, change `theme.extends` in
`extension.json` to that theme's id and rebuild.

## How it works

`src/theme.tsx` defines the theme with `defineTheme`:

| Piece | File |
| --- | --- |
| Skins for the UI kit | `src/skins.ts`, each extending classic's recipe |
| `layout.app` | `views/Shell.tsx`: the sidebar, the drawer and the page |
| `layout.account`, `layout.server`, `layout.admin` | `views/AreaLayout.tsx`: only the page, as the sidebar draws their navigation |
| `app.search` | `views/Search.tsx`: the sidebar field and the search dialog |
| `server.files.manager.list` | `views/FileList.tsx`: classic's rows in one card |
| `activity.log` | `views/ActivityLog.tsx`: classic's entries in one card |
| `layout.auth` | `views/AuthLayout.tsx`: the split screen |
| `page.auth.*` | `views/LoginPage.tsx`, `CheckpointPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` |

The entry holds only the skins, the sign-in layout and the area layouts, which import nothing but
`@pterodactyl/sdk/theme`, so the first screen draws at once; the shell, the search and the sign-in
forms load in chunks with their route. `src/theme.css` is the panel's stylesheet built with
Nightfall's classes and its two palettes, in plain Tailwind.

If a layer fails to render, the panel falls back to classic's. To see classic for one session,
open any page with `?safe_mode=1`.

The texts are in English, like the rest of the panel.

## Install

Upload `pterodactyl-nightfall-<version>.zip` in Admin → Extensions, or on the panel host:

```bash
php artisan p:extension:install pterodactyl-nightfall-1.0.0.zip --enable --replace
php artisan p:theme:activate nightfall
```

Or activate it on **Admin > Themes**, where **Preview for me** tries it without switching everyone.
Reload the page afterwards. To go back to classic: `php artisan p:theme:reset`.

Nightfall was called Portal (id `portal`) before. If Portal is installed, reset the theme and
remove it first: `php artisan p:theme:reset`, then `php artisan p:extension:remove portal`.
Settings (colours, logo, texts) do not carry over: set them again on **Admin > Themes**.

## Files

| File | Purpose |
| --- | --- |
| `extension.json` | Manifest: a theme extending classic, its schemes and settings |
| `src/theme.tsx` | `defineTheme`: skins and views |
| `src/theme.css` | The panel stylesheet with Nightfall's palettes, animations and dot grid |
| `src/skins.ts` | The UI kit recipes |
| `src/views/Shell.tsx` | The sidebar shell |
| `src/views/NavIcon.tsx` | Navigation icons by lucide name |
| `src/views/Search.tsx` | The search field and dialog |
| `src/views/FileList.tsx`, `ActivityLog.tsx` | The file list's and the activity log's cards |
| `src/views/AreaLayout.tsx` | The area layouts |
| `src/views/Brand.tsx`, `PterodactylMark.tsx` | The logo, or the mark and the panel's name |
| `src/views/AuthLayout.tsx` | The sign-in split screen |
| `src/views/AuthPanel.tsx`, `Field.tsx` | The sign-in form frame and fields |
| `src/views/*Page.tsx`, `pages.ts` | The four sign-in pages, loaded as one chunk |
| `src/theme.spec.tsx`, `src/shell.spec.tsx` | Tests, run with the SDK's real runtime |
