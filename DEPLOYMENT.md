# Deployment — app.gdpfirst.com

Target: `182.76.226.196` (Ubuntu 24.04), user `webserver0`, app at
`/var/www/html/mission-first`, pm2 process `mission-first` on `127.0.0.1:3010`,
nginx reverse proxy, Let's Encrypt via certbot.

## Safety notes for this server

This box already runs **9 nginx sites** and the pm2 processes `app` and
`nephro-wa-bot`. Everything here is additive:

- A **new** directory `/var/www/html/mission-first` — no existing directory is touched.
- A **new** file `/etc/nginx/sites-available/app.gdpfirst.com` and its symlink —
  `nginx.conf` and every other site config are left alone.
- A **new** pm2 process named `mission-first` — no other pm2 process is restarted.
- Port **3010**, chosen because 3000, 3001 and 3005 are already in use.
- `systemctl reload nginx` (graceful, keeps existing connections) — never `restart`.
- `nginx -t` must pass before any reload. If it fails, **stop** and fix; do not reload.

Rollback at any point: `pm2 delete mission-first`, remove the nginx symlink,
`sudo nginx -t && sudo systemctl reload nginx`. Nothing else is affected.

---

## One-time server setup

Steps 1, 3 and 6 need root. Run them yourself; the rest run as `webserver0`.

### 1. Create the directory (root)

```bash
sudo mkdir -p /var/www/html/mission-first
sudo chown webserver0:webserver0 /var/www/html/mission-first
```

### 2. Clone the repository (as webserver0)

The repo is private, so use a deploy key or a PAT-authenticated HTTPS clone.

```bash
cd /var/www/html/mission-first
git clone git@github.com:GiriSarthak/mission-first.git .
git checkout main
```

### 3. DNS

Point `app.gdpfirst.com` at `182.76.226.196` with an **A** record before
running certbot, or the challenge fails.

### 4. Environment file (as webserver0)

```bash
cd /var/www/html/mission-first
cp .env.production.example .env
openssl rand -base64 32          # paste into AUTH_SECRET
nano .env                        # fill AUTH_SECRET, ANTHROPIC_API_KEY, DEMO_PASSWORD
chmod 600 .env
```

### 5. First build and start (as webserver0)

```bash
cd /var/www/html/mission-first
npm ci --include=dev
npx prisma migrate deploy
npm run build
mkdir -p logs storage
pm2 start deploy/pm2.ecosystem.yaml
pm2 save
curl -I http://127.0.0.1:3010/login     # expect 200 before touching nginx
```

Optionally seed the demo data (creates the demo orgs, users and projects):

```bash
npm run db:seed
```

### 6. nginx + TLS (root)

Only after the curl above returns 200:

```bash
sudo cp /var/www/html/mission-first/deploy/nginx/app.gdpfirst.com.conf \
        /etc/nginx/sites-available/app.gdpfirst.com
sudo ln -s /etc/nginx/sites-available/app.gdpfirst.com \
           /etc/nginx/sites-enabled/app.gdpfirst.com
sudo nginx -t                    # MUST print "syntax is ok" / "test is successful"
sudo systemctl reload nginx      # graceful; does not drop existing sites
sudo certbot --nginx -d app.gdpfirst.com
```

`certbot --nginx` edits only this new site's config, adding the 443 server
block and the http→https redirect — the same pattern as the other sites here.

---

## CI/CD

- **`develop`** — day-to-day work. Every push runs `ci.yml`
  (typecheck, vitest, production build). No deployment.
- **`main`** — the deployment branch. A push (normally a merge from `develop`)
  runs the same checks and then, only if they pass, `deploy.yml` SSHes in and
  runs `deploy/deploy.sh`.

`deploy.sh` fetches `main`, `npm ci`, `prisma migrate deploy` (apply-only —
never resets), rebuilds, reloads **only** the `mission-first` pm2 process, and
health-checks `127.0.0.1:3010/login`, failing the job with logs if it doesn't
come up.

### Required GitHub repository secrets

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `182.76.226.196` |
| `DEPLOY_USER` | `webserver0` |
| `DEPLOY_SSH_KEY` | Private half of the dedicated deploy keypair (full PEM, including header/footer lines) |

The matching public key goes in `~webserver0/.ssh/authorized_keys` on the
server. It is dedicated to CI, so revoking it later doesn't affect your own
SSH access.

---

## Operating

```bash
pm2 logs mission-first --lines 100    # app logs
pm2 reload mission-first              # zero-downtime restart
pm2 describe mission-first            # status, memory, uptime
tail -f /var/log/nginx/app.gdpfirst.com.error.log
```

## Data

SQLite lives at `/var/www/html/mission-first/prisma/prod.db` and uploaded PDFs
at `/var/www/html/mission-first/storage/`. Both are gitignored and survive
deploys — `deploy.sh` only does `git reset --hard`, which does not touch
ignored files. Back them up together:

```bash
tar czf ~/mission-first-backup-$(date +%F).tar.gz \
    -C /var/www/html/mission-first prisma/prod.db storage
```
