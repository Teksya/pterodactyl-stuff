# pterodactyl-stuff

Extensions and a theme for Pterodactyl Panel 2.0, by Olivier DUTOIT. One folder per package,
each with its own manifest, version and README.

| Folder | Id | What it does |
| --- | --- | --- |
| [`monaco`](monaco) | `monaco` | Replaces the file editor's code editor with Monaco, the editor of Visual Studio Code. |
| [`turnstile`](turnstile) | `turnstile` | Replaces reCAPTCHA with Cloudflare Turnstile on the login, forgot password and password reset pages. |
| [`nightfall`](nightfall) | `nightfall` | Theme: near-black and light schemes, a sidebar for every navigation, a split-screen sign-in. |
| [`security-keys`](security-keys) | `security-keys` | Sign in with a YubiKey or any FIDO2 / WebAuthn key, at the two-factor checkpoint or without a password. |

## Install

Each release attaches `pterodactyl-<id>-<version>.zip`. Upload it in Admin → Extensions, or on
the panel host:

```bash
php artisan p:extension:install pterodactyl-<id>-<version>.zip --enable --replace
```

## Versions and releases

Each package is versioned on its own, in its `extension.json` and `package.json`. Releases are
tagged `<id>-v<version>`, such as `security-keys-v1.0.0`.
