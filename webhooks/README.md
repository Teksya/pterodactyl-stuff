# Webhooks

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT. Sends what happens on the panel to Discord,
Slack (and Mattermost, Rocket.Chat), Microsoft Teams, Telegram, ntfy, Gotify, Pushover, Matrix,
any HTTP endpoint as signed JSON, or a request you write yourself.

- **Admin → Webhooks.** Panel-wide webhooks receive any event: servers, users, nodes, eggs,
  mounts, API keys, themes, extensions. A webhook can be limited to some nodes or servers. The
  other tabs list every server's and every account's webhooks (to fix, turn off or delete one)
  and the delivery log of all of them.
- **Server → Webhooks.** A server's owner, and subusers with the webhook permissions, send that
  server's events to their own webhooks: power, crashes, CPU/memory/disk alerts, installs,
  backups, console commands, files, SFTP, schedules, databases, allocations, subusers.
- **Account → Webhooks.** Every user can be told about their account: sign-ins and failed
  attempts, password, email and two-factor changes, recovery codes, API and SSH keys.
- **Admin → Servers / Users → a server or user → Webhooks** shows and manages theirs.

Each webhook has a **Send a test** button, a **delivery log** (payload sent, response received,
attempts, **Redeliver**), and can be turned off without losing its settings.

## Events

Every entry of the panel's activity log (about 150 keys, such as `server:power.start`,
`server:backup.complete`, `auth:fail`, `admin:server.create`), plus:

| Event | From |
| --- | --- |
| `server:install.completed` / `.failed`, `server:reinstall.completed` / `.failed` | Install results Wings reports |
| `server:suspended`, `server:unsuspended`, `server:transfer.completed` / `.failed` | Server operations |
| `server:provisioned`, `server:deleted` (admin) | Server operations |
| `server:state.running`, `server:state.offline`, `server:state.crashed` | The monitor |
| `server:resources.cpu`, `server:resources.memory`, `server:resources.disk` | The monitor |
| `node:unreachable`, `node:reachable` (admin) | The monitor |
| `extension:installed`, `.enabled`, `.disabled`, `.removed`, `.failed` (admin) | Extension lifecycle |

The activity Wings reports (power and commands sent from the console, SFTP) is written in bulk,
without the event the activity log raises, so the extension wraps the panel's ingestion of it to
catch these entries too. See [Faster events from Wings](#faster-events-from-wings).

A webhook subscribes to single events, whole groups, patterns such as `server:backup.*` (also
for activity other extensions log), or every event its scope can receive.

**The monitor** polls, from the panel's scheduler, the servers some webhook wants state or
resource events for (through the panel's shared 20-second state cache, so it adds little load on
Wings). A server that goes offline without a stop, restart, kill, reinstall, suspension or
backup restore logged in the last few minutes is reported as `server:state.crashed`; a power
task from a schedule that ran in that time counts as a stop on purpose too. Resource
alerts fire once when usage crosses the threshold (a percentage of the server's limit) and again
only after it fell 10 points below. Servers without a limit are not checked for that resource.

## Faster events from Wings

Power actions sent from the console, console commands, SFTP and the file operations Wings does
itself reach the panel through Wings' activity reports, which it sends in batches every
`system.activity_send_interval` seconds: **60 by default**, so webhooks hear of these events up
to a minute late. Events the panel logs itself (power from the API or a schedule, backups,
settings, subusers...) are not delayed.

To send them within a few seconds, set the interval in `/etc/pterodactyl/config.yml` on each
node, under the existing `system:` section:

```yaml
system:
  activity_send_interval: 5
```

then restart Wings:

```bash
systemctl restart wings
```

Each report's oldest event tells how long Wings held it. When a node's recent reports held
events more than 20 seconds, **Admin → Webhooks** shows a warning naming the node and the delay,
which an administrator can ignore (in that browser, until another node reports late).

## Payload

The HTTP (JSON) service posts the whole event:

```json
{
    "id": "8b0c…",
    "event": "server:backup.complete",
    "label": "Backup completed",
    "group": "server.backups",
    "severity": "success",
    "description": "Marked the daily backup as complete",
    "occurred_at": "2026-10-23T10:00:00+00:00",
    "scope": "server",
    "test": false,
    "actor": { "type": "user", "uuid": "…", "username": "olivier" },
    "ip": null,
    "server": { "id": 3, "uuid": "…", "identifier": "1a2b3c4d", "name": "Survival", "url": "https://panel.example.com/server/1a2b3c4d", "node": { "id": 1, "name": "fr-1" } },
    "subjects": [],
    "properties": { "name": "daily" },
    "panel": { "name": "Pterodactyl", "url": "https://panel.example.com" }
}
```

Headers: `X-Webhook-Event`, `X-Webhook-Delivery` (the `id`), `X-Webhook-Timestamp`, and with a
signing secret `X-Webhook-Signature: sha256=<hex>`, the HMAC-SHA256 of `<timestamp>.<body>`:

```php
$expected = 'sha256='.hash_hmac('sha256', $_SERVER['HTTP_X_WEBHOOK_TIMESTAMP'].'.'.file_get_contents('php://input'), $secret);
$valid = hash_equals($expected, $_SERVER['HTTP_X_WEBHOOK_SIGNATURE']) && abs(time() - (int) $_SERVER['HTTP_X_WEBHOOK_TIMESTAMP']) < 300;
```

Server webhooks never receive IP addresses or email addresses; account webhooks receive the IP
of their own account's events; admin webhooks receive everything.

The **Custom request** service fills `{{event}}`, `{{label}}`, `{{description}}`,
`{{server.name}}`, `{{actor.username}}`, `{{message}}` (readable text), `{{payload}}` (the JSON
above) and any other payload path into a URL, headers and body you write, escaped for where
they land.

## Security

- Server and account webhooks can only target public addresses: every address the host resolves
  to is checked, and the request is pinned to the checked address so DNS cannot change it in
  between. Redirects are not followed. *Allow private addresses* lifts this; admin webhooks can
  always reach private addresses.
- URLs, tokens, secrets and extra headers are stored encrypted with the panel's `APP_KEY`, and
  shown masked: sending the mask back keeps the stored value.
- Managing a server's webhooks takes `ext.webhooks.manage` **and** the panel's `activity.read`,
  since a webhook receives the server's activity, console commands included. `ext.webhooks.read`
  shows the webhooks and their delivery log; opening a delivery's payload takes `activity.read`
  too. Account webhook routes refuse API keys.
- A saved token or secret only goes where it went before: changing a webhook's URL asks for its
  other secrets again. Error messages in the log keep only the scheme and host of a URL, so a
  Telegram token or a Discord webhook secret never shows there.
- Changes to webhooks are written to the activity log (`server:webhook.*`, `user:webhook.*`,
  `admin:webhook.*`).

## Delivery

Deliveries go through the panel's queue: run its queue worker (`pteroq`), or they are sent
during the request with a single attempt. A failed delivery is retried after 30 seconds,
2 minutes, 10 minutes, 30 minutes, then hourly, up to *Attempts per delivery*; a 4xx answer other
than 408, 425 and 429 is not retried, and a 429 waits as long as the target asks. Each webhook
sends at most *Requests per minute* (30 by default, about Discord's limit); the rest waits. A
webhook is turned off after *Turn off after failures in a row* (20) failed deliveries. The log
keeps *Keep the delivery log* days (14). Turning server or account webhooks off, or removing a
service from the ones users may choose, stops those webhooks from receiving; their owners can
still edit or delete them, and administrators can still manage them all.

Admin → Extensions → Webhooks holds these settings, which services users may choose, how many
webhooks a server or account may have, and the monitor's interval and thresholds.

```bash
php artisan webhooks:monitor --force   # run a monitor check now
php artisan webhooks:prune             # prune the delivery log now (also runs daily)
```

The monitor and pruning run from the panel's scheduler (`php artisan schedule:run` every minute,
as the panel itself needs).

## Install

```bash
php artisan p:extension:install pterodactyl-webhooks-1.0.0.zip --enable --replace
```

Enabling runs `database/migrations` (tables `webhook_endpoints`, `webhook_deliveries`,
`webhook_server_monitors`); no `php artisan migrate` needed. Requires PHP 8.3.
