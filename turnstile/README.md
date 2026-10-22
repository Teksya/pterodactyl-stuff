# Cloudflare Turnstile

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT. It replaces reCAPTCHA with
[Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) on the login, forgot
password and password reset pages.

## How it works

- **Backend.** The panel guards `POST /auth/login`, `/auth/password` and `/auth/password/reset`
  with its `recaptcha` middleware. The extension's provider binds that middleware's class to
  `VerifyTurnstile`, which checks the `cf-turnstile-response` token with Cloudflare's
  `siteverify` endpoint (and, optionally, that it was solved on the panel's hostname). A failed
  check answers `400` and fires the panel's `FailedCaptcha` event, like reCAPTCHA did.
- **Frontend.** The widget is mounted in the `auth.login.form.after`, `auth.password.after` and
  `auth.passwordReset.after` slots. A request interceptor on the panel's shared axios instance
  (`http` from `@pterodactyl/sdk/api`) adds the token to those three posts. Tokens are single-use,
  so the widget restarts after each submit (a wrong password gets a fresh challenge).
- **Fallback.** Until both keys are set, or while the extension is disabled, the panel's own
  reCAPTCHA check runs unchanged.
- **reCAPTCHA off.** Once both keys are set, the provider turns the panel's `recaptcha.enabled`
  off for every request: the auth pages no longer load Google's script or badge, Admin →
  Settings → Advanced shows reCAPTCHA disabled, and saving it enabled is refused with a
  validation error. The stored setting is left untouched, so disabling the extension (or
  clearing its keys) brings reCAPTCHA back as it was configured.

## Setup

1. In the Cloudflare dashboard, create a Turnstile widget for your panel's hostname.
2. Install and enable the extension (see below).
3. Admin → Extensions → Cloudflare Turnstile: paste the **site key** and **secret key**, pick a
   widget theme, and keep **Verify hostname** on unless the panel is reached through several
   hostnames.

## Build and install

The SDK is not published on npm yet, so the extension builds from a Panel 2.0 checkout
(Node.js 22.12+), placed in `extensions/turnstile`:

```bash
cd extensions/turnstile
npm install
npm run typecheck
npm test
npm run build
cd ../..
php artisan p:extension:install extensions/turnstile --enable
```

A ready-to-install archive is attached to each GitHub release: upload it in Admin → Extensions,
or run `php artisan p:extension:install pterodactyl-turnstile-<version>.zip --enable`.

## Troubleshooting

- Locked out: `php artisan p:extension:disable turnstile` brings back the panel's own check.
- `?safe_mode=1` shows the panel without extension bundles (the server-side check still runs
  while the extension is enabled).

## Files

| File | Purpose |
| --- | --- |
| `extension.json` | Manifest: provider, autoload, Tailwind prefix `ts` |
| `src/TurnstileProvider.php` | Settings, the middleware binding, reCAPTCHA switch-off |
| `src/Http/Middleware/VerifyTurnstile.php` | Server-side token verification |
| `src/client/index.tsx` | Slots and the request interceptor |
| `src/client/TurnstileWidget.tsx` | Loads and renders the widget |
| `src/client/token.ts` | Token store and request helpers |
| `src/client/turnstile.spec.tsx` | Tests, run with the SDK's real runtime |
