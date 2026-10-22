# Security Keys

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT. Users sign in with a hardware security key
(YubiKey or any FIDO2 / WebAuthn authenticator, passkeys included):

- **At the two-factor checkpoint.** "Use a security key" under the checkpoint form. The
  authenticator app and the recovery codes keep working; a key is one more way through. An account
  with a key and **no** authenticator app also gets a checkpoint after its password, answered
  with the key (the prompt opens at once).
- **Without a password** (optional, off by default). Admin → Extensions → Security Keys →
  *Passwordless sign-in* adds "Sign in with a security key" to the login page. Only passkeys
  that verify the user (PIN or biometrics) are accepted, and they stand for both factors. Tick
  "Use for passwordless sign-in" when adding the key: without it the key stores no passkey and
  only works as a second factor.
- **Account → Security Keys** to add (password asked), rename and remove (password asked) keys.
- **Admin → Users → a user → Security Keys** to remove a lost key.

## How it works

- A key that passes ends the sign-in through the panel's own `CompletesLogins::establish()`
  (session regenerated, `DirectLogin` and `auth:token` activity), as the TOTP checkpoint does.
- `wrapAction(CompletesLogins)` issues the panel's `LoginCheckpoint` (5 minutes) for key-only
  accounts, under the extension's own session key; `pendingCheckpoint()` returns it to the core
  checkpoint and to the extension alike.
- Visitor endpoints live under `/extensions/security-keys/{checkpoint,login}` in the `web` group
  (session + CSRF), behind `guest` and `throttle:authentication`, and failures count towards the
  same lockout as the panel's login (`ThrottlesLogins`).
- Challenges are kept in the session, single use, 150 seconds. The assertion's origin must be
  exactly the one of `APP_URL`, the relying party id is its host, and the signature counter is
  checked. Key management routes refuse API keys (`RequireSessionAuthentication`).
- WebAuthn verification: [`lbuchs/webauthn`](https://github.com/lbuchs/WebAuthn) 2.2.0 (MIT, no
  dependencies) bundled in `vendor/`, autoloader suffix `OlivierDutoitSecurityKeysExtension`.
- Sign-in pages are slots (`auth.checkpoint.after`, `auth.login.form.after`): plain extensions
  cannot override guest views.

`APP_URL` must be the HTTPS address users open the panel at: keys registered on one hostname do
not work on another.

## Install

```bash
php artisan p:extension:install pterodactyl-security-keys-1.0.0.zip --enable --replace
```

Enabling runs `database/migrations` (table `security_key_credentials`); no `php artisan migrate`
needed. Requires PHP 8.3 with `openssl`.

Locked out (key lost, no recovery code): an admin removes the key on the user's Security Keys
tab, or `php artisan p:extension:disable security-keys` turns the extension off (key-only accounts
then sign in with their password alone).
