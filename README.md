# pterodactyl-stuff

Extensions and a theme for Pterodactyl Panel 2.0, by Olivier DUTOIT. One folder per package,
each with its own manifest, version and README.

| Folder | Id | What it does |
| --- | --- | --- |
| [`monaco`](monaco) | `monaco` | Replaces the file editor's code editor with Monaco, the editor of Visual Studio Code. |
| [`turnstile`](turnstile) | `turnstile` | Replaces reCAPTCHA with Cloudflare Turnstile on the login, forgot password and password reset pages. |
| [`portal`](portal) | `portal` | Theme: near-black and light schemes, a sidebar for every navigation, a split-screen sign-in. |
| [`security-keys`](security-keys) | `security-keys` | Sign in with a YubiKey or any FIDO2 / WebAuthn key, at the two-factor checkpoint or without a password. |

## Install

Each release attaches `pterodactyl-<id>-<version>.zip`. Upload it in Admin → Extensions, or on
the panel host:

```bash
php artisan p:extension:install pterodactyl-<id>-<version>.zip --enable --replace
```

## Build

The SDK is not published on npm yet: its `package.json` points at `../../packages/sdk`, so each
package builds from a Panel 2.0 checkout (branch `2.0-develop`, Node.js 22.12+), copied to
`extensions/<id>`:

```bash
npm ci --no-audit --no-fund --ignore-scripts   # at the panel root, once
npm run sdk:testing                            # at the panel root, for the tests
cd extensions/<id>
npm install
npm run typecheck
npm test
npm run build
```

Copy `dist/` back into the package's folder here, then `python scripts/pack.py <folder>` writes
`pterodactyl-<id>-<version>.zip` at the repository root, as `php artisan p:extension:pack` would
(no source maps). Zips and `dist/` are not committed.

## Versions and releases

Each package is versioned on its own, in its `extension.json` and `package.json`. Releases are
tagged `<id>-v<version>`, such as `security-keys-v1.0.0`.
