# Git Deploy

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT. Deploys a server's files from a Git
repository on GitHub, GitLab, Gitea, Forgejo or any Git server: on every push, or in one click,
with the files the server keeps between deploys, a history of every deploy and a rollback to the
previous ones.

It works with **any egg**, without Git in the server's image: the panel downloads the commit and
sends the files to Wings, as the file manager would. It fills the gaps of the eggs that pull a
repository themselves (`GIT_ADDRESS`, `BRANCH`, `ACCESS_TOKEN`, `AUTO_UPDATE`): those only pull at
start, keep the token in a variable subusers can read, fail on files changed in the server, and
have no webhook, history or rollback.

- **Server → Deploy.** Links the server to a repository, then deploys a commit (the branch's last
  one, or one of the 15 before it), shows every deploy with its log, and rolls back to an earlier
  one. The webhook's URL and secret are there, with the steps for each forge.
- **Admin → Git Deploy.** Every server deploying from a repository, with its last deploy.

## How a deploy works

1. The panel downloads the commit: through the forge's API as a zip (GitHub, GitLab, Gitea), or
   with `git` on the panel's host (any Git server, SSH addresses).
2. It packs the files without `.git` and without the **shared paths** the server already has.
3. It sends the archive to the server's folder through Wings' upload endpoint, with a token it
   signs, and checks its size.
4. It moves the files in place to `.deploy/releases/<release>/` in the folder, except the shared
   paths, then unpacks the new ones.
5. It restarts the server, starts it, sends a console command, or does nothing.

If anything fails after the files moved away, they are put back. The newest releases (5 by
default) stay in `.deploy/releases/`: **Roll back** swaps one back the same way and keeps the
current files as a release, so a rollback can be undone. Builds (`npm install`,
`composer install`...) stay the egg's job at start.

**Shared paths** are files and folders the server owns: configuration (`.env`), uploads,
dependencies (`node_modules/`), data (`storage/`). A deploy never replaces them; the first deploy
brings them from the repository when the server has none yet. A nested path (`public/uploads`)
keeps its folder's other files deployed.

## Forges

| Forge | Address | Access |
| --- | --- | --- |
| GitHub, GitHub Enterprise | `https://github.com/owner/repo` | A fine-grained token with Contents: Read, or none for a public repository |
| GitLab.com, self-managed GitLab | `https://gitlab.example.com/group/project` | A project token with `read_repository` and `read_api` |
| Gitea, Forgejo, Codeberg | `https://git.example.com/owner/repo` | A token with repository: read |
| Any Git server | `https://…` or `git@host:owner/repo.git` | A token as the HTTPS password, or a **deploy key** the panel generates for SSH |

Tokens, deploy keys and webhook secrets are stored encrypted, and never shown back: a saved token
reads as "Saved". SSH addresses and "Any Git server" need the `git` command on the panel's host;
the Deploy tab says when it is missing.

When the server's egg already has `GIT_ADDRESS` and `BRANCH`, the form starts from them, can copy
`ACCESS_TOKEN`, and reminds to set `AUTO_UPDATE` to 0 so the egg stops pulling on its own.

## Webhook

Each repository gets a URL, `https://<panel>/extensions/git-deploy/hooks/<id>`, and a secret:

- **GitHub**: Settings → Webhooks, content type `application/json`, the secret; push events.
- **GitLab**: Settings → Webhooks, the secret as *Secret token*; push events.
- **Gitea / Forgejo**: Settings → Webhooks → Gitea, the secret; push events.
- **Anything else** (CI job, script): `POST` with the header `X-Deploy-Token: <secret>`; it deploys
  the branch's last commit.

GitHub and Gitea sign the body (HMAC-SHA256), GitLab and scripts send the secret: a call without it
is refused. Pushes to other branches, tags and deleted branches are ignored, as are pushes to a
suspended server or one with **Deploy on every push** off. **New secret** replaces the secret.

## Settings

Admin → Extensions → Git Deploy:

| Setting | Default |
| --- | --- |
| Forges users can deploy from | All four |
| Allow forges on private networks | Off. Turn it on for a GitLab or Gitea on your own network; it lets anyone who can link a repository make the panel send requests there. |
| Largest deploy | 200 MB compressed. Wings also limits uploads (`api.upload_limit`, 100 MB by default). |
| Releases kept for rollback | 5; they count toward each server's disk |

Deploys run on the panel's queue worker, one at a time per server; without one they run during
the request.

## Permissions

| Permission | Allows |
| --- | --- |
| `ext.git-deploy.read` | Seeing the repository and the deploys, with their logs |
| `ext.git-deploy.deploy` | Deploying a commit and rolling back |
| `ext.git-deploy.manage` | Linking the repository and changing its settings, token, deploy key and webhook secret |

Linking, deploying and rolling back by hand are written to the server's activity log
(`server:git-deploy.repository`, `.deploy`, `.rollback`, `.unlink`).

## Install

```bash
php artisan p:extension:install pterodactyl-git-deploy-1.0.0.zip --enable --replace
```
