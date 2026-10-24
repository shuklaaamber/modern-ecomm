# Deploying on a free Oracle Cloud VM

Stack: one Always Free VM running Docker (app + Caddy for HTTPS). Neon (Postgres), a free Redis, Resend, Axiom and Sentry are external.
Free-tier terms change; check each provider's current limits. Razorpay stays in **test mode** (`lib/env.ts` rejects live keys on purpose).

## 1. One-time accounts
- **Oracle Cloud** Always Free: create an Ubuntu ARM (Ampere A1) instance, open ingress TCP 80 and 443 in the VCN security list.
- **Domain** pointing an `A` record at the VM's public IP (needed for HTTPS, Razorpay webhooks and a verified Resend sender).
- **Redis**: Upstash or Redis Cloud free database; copy the `rediss://` URL.
- **Resend**: verify your domain, set `EMAIL_FROM` to an address on it.
- **Axiom** dataset + ingest token, **Sentry** project DSN, **UptimeRobot** HTTP monitor on `https://<domain>/api/health`.

## 2. VM setup
```
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git postgresql-client
sudo sh -c 'ufw allow 22,80,443/tcp; ufw --force enable'   # Ubuntu on Oracle also has iptables rules: allow 80/443 there too
sudo git clone https://github.com/shuklaaamber/modern-ecomm.git /opt/modern-ecomm && cd /opt/modern-ecomm
cp .env.production.example .env.production && chmod 600 .env.production && nano .env.production
```

## 3. First deploy
```
docker compose -f deploy/docker-compose.yml --env-file .env.production --profile tools run --rm migrate
docker compose -f deploy/docker-compose.yml --env-file .env.production up -d --build
curl -fsS https://<domain>/api/health
```
The app refuses to start if a production secret is missing (see `lib/env.ts`); read `docker compose ... logs app` if so.
Seed the catalog once: `docker compose -f deploy/docker-compose.yml --env-file .env.production --profile tools run --rm migrate npx tsx db/seed.ts`
(prints the admin password once; change it).

## 4. Razorpay webhook
Razorpay dashboard (test mode) -> Webhooks -> `https://<domain>/api/razorpay/webhook`, event `payment.captured`; paste its secret into `RAZORPAY_WEBHOOK_SECRET`, then `up -d` again.

## 5. Cron and backups
- GitHub repo -> Settings -> Secrets: `APP_URL` (`https://<domain>`) and `CRON_SECRET` (same as server). `.github/workflows/cron.yml` then releases expired reservations every ~10 min.
- Backups: `crontab -e` -> `15 2 * * * /opt/modern-ecomm/scripts/backup-db.sh >> /var/log/backup-db.log 2>&1`. Copy `/var/backups/thread-and-co` off the VM periodically. Do not upload dumps as GitHub artifacts (they contain customer data).

## 6. Updating
```
cd /opt/modern-ecomm && git pull
docker compose -f deploy/docker-compose.yml --env-file .env.production --profile tools run --rm migrate
docker compose -f deploy/docker-compose.yml --env-file .env.production up -d --build
```
Sentry source maps: pass `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` only as build-time secrets (not wired into the compose build; add as build args if wanted).
