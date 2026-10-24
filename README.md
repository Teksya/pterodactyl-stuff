# pterodactyl-stuff

Extensions and a theme for Pterodactyl Panel 2.0, by Olivier DUTOIT. One folder per package,
each with its own manifest, version and README.

| Folder | Id | What it does |
| --- | --- | --- |
| [`monaco`](monaco) | `monaco` | Replaces the file editor's code editor with Monaco, the editor of Visual Studio Code. |
| [`turnstile`](turnstile) | `turnstile` | Replaces reCAPTCHA with Cloudflare Turnstile on the login, forgot password and password reset pages. |
| [`nightfall`](nightfall) | `nightfall` | Theme: near-black and light schemes, a sidebar for every navigation, a split-screen sign-in. |
| [`security-keys`](security-keys) | `security-keys` | Sign in with a YubiKey or any FIDO2 / WebAuthn key, at the two-factor checkpoint or without a password. |
| [`webhooks`](webhooks) | `webhooks` | Panel, server and account events to Discord, Slack, Teams, Telegram, ntfy, Gotify, Pushover, Matrix or any HTTP endpoint. |
| [`console-plus`](console-plus) | `console-plus` | A console you can read (search, level filters, colours, folded stack traces, clickable links, favourite commands, saved history, log download) and live cards and graphs over up to an hour. |
| [`server-organizer`](server-organizer) | `server-organizer` | Organise the dashboard's servers: folders with drag and drop, grouping by node, location or egg, owned or shared filters, your own order. |

## Install

Each release attaches `pterodactyl-<id>-<version>.zip`. Upload it in Admin → Extensions, or on
the panel host:

```bash
php artisan p:extension:install pterodactyl-<id>-<version>.zip --enable --replace
```

## Versions and releases

Each package is versioned on its own, in its `extension.json` and `package.json`. Releases are
tagged `<id>-v<version>`, such as `security-keys-v1.0.0`.
