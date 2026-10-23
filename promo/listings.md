# Listing texts

One section per package: a tagline (fits under a title, about 60 characters), a short
description (about 160 characters, for cards and search results), a long description in
Markdown for the product page, and tags. Each goes with the image of the same name in this
folder. All of them need **Pterodactyl Panel 2.0** (extension system, SDK 2.0.0-beta.5 or later).

---

## Server Organizer

**Tagline:** Your dashboard, organised your way.

**Short description:** Folders with drag and drop, grouping by node, location or egg, owned or
shared filters and your own order for the Pterodactyl dashboard. Synced on every device.

**Long description:**

Long server lists get messy fast. Server Organizer lets every user arrange the dashboard the way
they think about their servers, and finds it the same on every device.

- **Folders** — create, rename, reorder, fold and delete them. Drag a server onto a folder, or
  move it from its menu (keyboard and phone friendly).
- **Group by** folder, node, location, egg or owner (yours / shared with you), or not at all.
  Groups fold and stay folded.
- **Show** all your servers, only the ones you own or only the ones shared with you.
  Administrators can also show other users' servers, or every server.
- **Sort** by name (Lobby 2 before Lobby 10), creation date, or your own order by drag and drop.
- **Search** by name, description, identifier, node, location or egg.
- **A clean dashboard by default**: menus and filters appear only when you click *Arrange*.

The panel's own server cards stay in place (live status, CPU, memory, disk, address, power
buttons), so your theme and the extensions that add to the cards keep working.

**Requirements:** Pterodactyl Panel 2.0, PHP 8.3. One small table, created when the extension
is enabled.

**Tags:** dashboard, folders, organize, servers, sort, group, drag and drop, quality of life

---

## Webhooks

**Tagline:** Every panel event, sent wherever you want it.

**Short description:** Send panel, server and account events to Discord, Slack, Teams,
Telegram, ntfy, Gotify, Pushover, Matrix or any HTTP endpoint. Signed, retried and logged.

**Long description:**

Know when a server starts, crashes, finishes a backup or when someone signs in, without
watching the panel.

- **Ten services**: Discord, Slack (and Mattermost, Rocket.Chat), Microsoft Teams, Telegram,
  ntfy, Gotify, Pushover, Matrix, signed HTTP JSON, or a custom request you write yourself.
- **About 190 events**: the whole activity log (power, console, files, SFTP, backups,
  schedules, databases, subusers, sign-ins, API keys…), installs, suspensions, transfers and
  extension changes.
- **A built-in monitor** for crashes, high CPU, memory or disk usage, and unreachable nodes.
- **Three levels**: panel-wide webhooks for administrators (optionally limited to some nodes or
  servers), server webhooks for owners and subusers, account webhooks for every user.
- **Reliable delivery**: retries with back-off, rate limiting, automatic turn-off after repeated
  failures, HMAC-SHA256 signatures for HTTP targets.
- **Test button and delivery log** with the payload sent, the response received and one-click
  redelivery.
- **Safe for users**: encrypted secrets, public-only targets for user webhooks, and IP and email
  addresses kept out of server webhooks.
- **Fast events from Wings**: power actions and commands sent from the console are caught too,
  and the admin page warns when a node reports them late, with the one-line fix.

**Requirements:** Pterodactyl Panel 2.0, PHP 8.3, the panel's queue worker and scheduler (both
part of a standard install).

**Tags:** webhooks, discord, slack, telegram, notifications, alerts, monitoring, crash detection

---

## Nightfall

**Tagline:** A modern theme for the whole panel.

**Short description:** A near-black and a light scheme, a sidebar for every navigation, softer
components and a split-screen sign-in for Pterodactyl Panel 2.0.

**Long description:**

Nightfall gives Pterodactyl a clean, modern look without changing how it works.

- **Dark and light schemes**: near-black instead of slate, or a crisp light scheme. Each user
  picks dark, light or system. The console and file editor stay dark in both.
- **A sidebar for every navigation**: server, account and admin menus, global search, your
  account and sign-out in one place. It folds into an icon rail, and becomes a drawer on phones.
- **Softer components everywhere**: rounded buttons, inputs, cards, dialogs, menus, tables and
  charts, for every page and every extension built with the panel's UI kit.
- **A split-screen sign-in** for login, password reset and two-factor, with a gradient brand side.
- **Your brand**: primary and accent colours, logo, sign-in tagline and subtitle, all set from
  Admin → Themes.

Every extension slot stays rendered, so other extensions (Cloudflare Turnstile, Security Keys,
Webhooks, Server Organizer…) keep working and pick up the theme.

**Requirements:** Pterodactyl Panel 2.0.

**Tags:** theme, dark mode, light mode, sidebar, modern, UI, customization, branding

---

## Security Keys

**Tagline:** Sign in with a YubiKey or a passkey.

**Short description:** Add hardware security keys (YubiKey, any FIDO2 / WebAuthn key, passkeys)
to Pterodactyl: as a second factor, or for passwordless sign-in.

**Long description:**

Phishing-resistant sign-in for your panel, built on WebAuthn.

- **Second factor at the checkpoint**: after the password, the key prompt opens at once. Users
  with an authenticator app can still switch to their code.
- **Passwordless sign-in** (optional): a "Sign in with a security key" button on the login page.
  Only passkeys that verify the user with a PIN or biometrics are accepted.
- **Account → Security Keys**: users add, rename and remove their own keys (password asked).
- **Admin → Users → Security Keys**: administrators remove a lost key.
- Uses the panel's own sign-in flow (sessions, activity log, checkpoints), so nothing else changes.

**Requirements:** Pterodactyl Panel 2.0, PHP 8.3, HTTPS.

**Tags:** security, 2FA, MFA, YubiKey, FIDO2, WebAuthn, passkeys, passwordless

---

## Monaco Editor

**Tagline:** The editor of VS Code, in the file manager.

**Short description:** Replaces Pterodactyl's file editor with Monaco, the editor of Visual
Studio Code: multi-cursor, find and replace, minimap, command palette.

**Long description:**

Edit configs and scripts in your browser like you would in VS Code.

- **Monaco's editing**: multi-cursor, find and replace, code folding, bracket matching, minimap,
  command palette (F1), go to line (Ctrl+G), comment toggling.
- **Syntax highlighting** for every language of the panel's language picker, plus validation
  and completion for JSON, CSS and HTML.
- **Ctrl+S saves**, exactly like the Save button.
- **Matches your theme**: uses the active theme's editor colours, in dark and light.
- **Loaded only when needed**: Monaco downloads the first time a file is opened, never on other
  pages.
- Read-only for subusers who cannot edit files.

**Requirements:** Pterodactyl Panel 2.0.

**Tags:** editor, monaco, vscode, file manager, code, syntax highlighting

---

## Cloudflare Turnstile

**Tagline:** reCAPTCHA out, Turnstile in.

**Short description:** Replaces Google reCAPTCHA with Cloudflare Turnstile on Pterodactyl's
login, forgot password and password reset pages. No puzzles for your users.

**Long description:**

Keep bots off your sign-in pages without making people click on traffic lights.

- **Turnstile on every sign-in page**: login, forgot password and password reset.
- **Checked on the server**: each token is verified with Cloudflare (optionally against your
  panel's hostname) before the panel processes the request.
- **No Google script**: once your keys are set, reCAPTCHA is switched off and its script and
  badge are no longer loaded.
- **Safe fallback**: until both keys are set, or if the extension is disabled, the panel's
  reCAPTCHA runs exactly as before.
- Works with the default look and with themes such as Nightfall.

**Requirements:** Pterodactyl Panel 2.0, PHP 8.3, a free Cloudflare Turnstile site key and
secret key.

**Tags:** captcha, cloudflare, turnstile, security, bot protection, login, recaptcha alternative
