# Subdomains

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT. Gives each server an address such as
`play.example.com` that players join with instead of its IP address, by making its DNS records
at Cloudflare.

- **Server → Subdomains.** A server's owner, and subusers with the subdomain permissions, pick a
  name under one of the offered domains, checked as they type, and the allocation it points at
  (the primary one by default, followed when it changes). A preview shows what players will type.
- **Admin → Subdomains.** Every server's subdomains, with their state, a button to update their
  records or delete them, and a check that the Cloudflare token reaches each domain.
- **Admin → Servers → a server → Subdomains.** Manages the server's subdomains, without the
  users' limit, and also while users are not allowed to make them.

## Records

Each subdomain gets:

| Record | Points at |
| --- | --- |
| `A` or `AAAA` `play.example.com` | The allocation's alias when it is an IP, else its IP when it is public |
| `CNAME` `play.example.com` | The alias when it is a host name, else the node's FQDN, when the allocation's IP is private or `0.0.0.0` |
| `SRV` `_minecraft._tcp.play.example.com` | `play.example.com` and the allocation's port |

The SRV record lets players join with the name alone, whatever the port. Only games that look
one up get it: **Minecraft Java** (and its proxies) `_minecraft._tcp`, **TeamSpeak 3** `_ts3._udp`
and **Mumble** `_mumble._tcp`, recognised from the egg's name and tags, its Docker image and its
startup command. Other games (Bedrock, Rust, Source games...) join with `play.example.com:port`,
which the panel shows. In the **Records** tab of the settings, a line `Egg name: _service._proto`
adds an SRV record for an egg, and `Egg name: none` removes it.

Records are never proxied (game traffic cannot go through Cloudflare's proxy) and carry the
comment `Pterodactyl server <id> (<name>)`. A name that already has records in the zone, made
outside the panel, is refused.

They follow the server:

- a new primary allocation, egg, Docker image or startup command rewrites them;
- deleting the server deletes them;
- `php artisan subdomains:sync`, run daily by the panel's scheduler, rewrites every subdomain's
  records and puts back those changed or deleted at Cloudflare. `--server=<id>` limits it to one
  server.

Deleting a subdomain while Cloudflare cannot be reached removes it from the panel at once and
retries its records from the queue.

## Setup

1. At Cloudflare, **My Profile → API Tokens → Create Token**, with the permissions
   **Zone → DNS → Edit** and **Zone → Zone → Read**, on the zones of the domains to offer.
2. In **Admin → Extensions → Subdomains**, paste the token in the **Cloudflare** tab and list
   the domains under **Domains**. A domain may be a zone (`example.com`) or a name inside one
   (`play.example.com`, which gives `name.play.example.com`).
3. **Admin → Subdomains → Check the connection** tells whether the token reaches each domain.

The other settings: whether users can make subdomains, how many per server (1 by default), the
shortest name, the reserved names (`www`, `mail`, `panel`... by default) and the records' TTL.

The panel's queue worker runs the updates after a server changes; without one they run during
the request.

## Permissions

| Permission | Allows |
| --- | --- |
| `ext.subdomains.read` | Seeing the server's subdomains |
| `ext.subdomains.manage` | Creating, moving, updating and deleting them |

Subdomains made and deleted by users are written to the server's activity log as
`server:subdomain.create` and `server:subdomain.delete`.

## Install

```bash
php artisan p:extension:install pterodactyl-subdomains-1.0.0.zip --enable --replace
```
