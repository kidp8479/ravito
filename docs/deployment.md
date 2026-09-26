# Deployment (DigitalOcean Droplet)

Runbook for ADR 0004: one Droplet, Docker Compose, Caddy for automatic
HTTPS. Follow this top to bottom for the first deploy; see "Updating" at
the end for every deploy after that.

## 0. Domain

Done: `ravi-to.app`, registered free via the GitHub Student Developer
Pack (Name.com). Let's Encrypt (step 6) needs it - a Droplet's bare IP
can't get a certificate.

## 1. Provision the Droplet

- Ubuntu 24.04 LTS, smallest size that gives at least 1 GB RAM (Postgres +
  two Node processes + Caddy) - the $6/mo plan (1 vCPU, 1 GB RAM).
- Region close to you and your partner.
- Add your SSH key at creation time - don't set a root password at all if
  the DigitalOcean UI offers that choice.
- Note the Droplet's public IP.

## 2. DNS

Point both subdomains at the Droplet's IP before continuing - Caddy's
automatic HTTPS (step 6) needs both to resolve *before* it requests
certificates, or it fails the ACME HTTP challenge. Add these records in
Name.com's DNS settings for `ravi-to.app`:

```
A    app.ravi-to.app    <droplet-ip>
A    api.ravi-to.app    <droplet-ip>
```

## 3. Harden the server

SSH in as root once, then:

```sh
# Non-root user with sudo
adduser ravito
usermod -aG sudo ravito
rsync --archive --chown=ravito:ravito ~/.ssh /home/ravito

# Disable root login and password auth over SSH
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall: only SSH, HTTP, HTTPS
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw --force enable

# Automatic security updates
apt update && apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

From here on, SSH in as `ravito`, not `root`.

## 4. Install Docker

Follow Docker's official install instructions for Ubuntu (the `apt`
repository method, not the convenience script) - installs both the Docker
Engine and the `docker compose` plugin. Add the `ravito` user to the
`docker` group afterwards so `sudo` isn't needed for every command:

```sh
sudo usermod -aG docker ravito
# log out and back in for the group change to apply
```

## 5. Clone the repo and configure secrets

```sh
git clone git@github.com:kidp8479/ravito.git
cd ravito
cp .env.prod.example .env.prod
```

Edit `.env.prod`:

- `POSTGRES_PASSWORD` and `JWT_ACCESS_SECRET`: generate fresh values with
  `openssl rand -base64 32` each - **never reuse the local-dev `.env`
  values** (ADR 0004).
- `APP_DOMAIN=app.ravi-to.app`, `API_DOMAIN=api.ravi-to.app`.

## 6. First deploy

```sh
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Watch Caddy's logs until both certificates are issued (first run only,
usually under a minute once DNS has propagated):

```sh
docker compose -f docker-compose.prod.yml logs -f caddy
```

## 7. Run the database migrations

The `prod` image doesn't run migrations on startup (an explicit step, not
an automatic one, so a bad migration doesn't take the app down on every
restart):

```sh
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

## 8. Verify

- `https://app.ravi-to.app` loads the app and the certificate is valid
  (padlock, no warning).
- Register an account, confirm login works and the shopping list updates
  in real time between two browser tabs (ADR 0003's WebSocket gateway
  reaching through Caddy correctly).

## Updating

```sh
cd ravito
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
# only if the new commit added a migration:
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

## Backups

Handled by DigitalOcean's paid **Backups** add-on (enabled on this
Droplet): a weekly full-disk snapshot, stored on DigitalOcean's
infrastructure, separate from the Droplet's own disk - satisfies "backup
exists somewhere other than the Droplet itself" on its own. Restoring
means recreating the Droplet from a snapshot, whole-machine, not just the
database.

Optional, if a snapshot's weekly granularity isn't enough (e.g. wanting
to recover just the database to a point a few hours old, without
recreating the whole Droplet): a daily cron dumping just the database to
a file outside the Docker volume, pulled to a local machine periodically:

```sh
# /etc/cron.d/ravito-backup, as the ravito user
0 3 * * * cd /home/ravito/ravito && docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db pg_dump -U ravito ravito | gzip > /home/ravito/backups/ravito-$(date +\%Y\%m\%d).sql.gz
```

```sh
# from your local machine, run by hand or on your own cron
scp ravito@<droplet-ip>:/home/ravito/backups/ravito-*.sql.gz ~/ravito-backups/
```

## Tearing down and restoring

Destroying the Droplet also destroys its data (the Postgres volume) and
`.env.prod`; DigitalOcean's weekly Backups are tied to the Droplet and go
with it. Before destroying:

1. Dump the database to your machine: `make prod-dump HOST=<droplet-ip>`
   (writes `~/ravito-backups/ravito-<date>.sql.gz`).
2. Save `.env.prod` in your password manager. It is not in git. Fresh
   secrets also work, but: new `JWT_ACCESS_SECRET` logs everyone out, and
   `POSTGRES_PASSWORD` must match whatever the restored database is
   started with (on a fresh volume, the new `.env.prod` value simply
   applies).
3. Optionally keep a DigitalOcean snapshot (small storage cost) for a
   whole-machine restore.

To bring it back:

1. Follow steps 1 to 6 above (new Droplet, so **new IP**: update both A
   records at Name.com first, or Caddy cannot get certificates).
2. Skip step 7 (`prisma migrate deploy`): the dump already contains the
   schema and the `_prisma_migrations` table. Restore it instead:

```sh
gunzip -c ravito-<date>.sql.gz | ssh ravito@<new-ip> \
  "cd ravito && docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db psql -U ravito ravito"
```

3. Verify as in step 8 (log in with an existing account).

If the restore is done on a database that already ran the migrations, drop
and recreate it first, or the dump's `CREATE TABLE` statements will fail.

## Security checklist recap

See ADR 0004 for the reasoning; at a glance, before calling this done:

- [ ] SSH: key-only, root login disabled.
- [ ] Firewall: only 22/80/443 open; Postgres never published to the host.
- [ ] `.env.prod` has fresh secrets, not copied from local dev.
- [ ] `FRONTEND_ORIGIN` / CORS points at the real `app.` domain.
- [ ] Both subdomains serve valid HTTPS (Caddy-issued, not self-signed).
- [ ] `unattended-upgrades` enabled for OS security patches.
- [ ] A backup exists somewhere other than the Droplet's own disk.
