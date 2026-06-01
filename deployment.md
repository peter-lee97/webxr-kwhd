# WebXR KWHD — deployment runbook

## Current production target

| Key | Value |
|---|---|
| Provider | Hetzner Cloud |
| Host/IP | `49.12.186.48` |
| Domain | `vr.compilechicken.com` |
| SSH user | `root` |
| SSH key | `.ssh/hetzner_id` |

SSH:

```bash
ssh -i .ssh/hetzner_id root@49.12.186.48
```

## Stack

`Internet -> Caddy (TLS/443) -> webxr-app:3000 (Express) -> ./captures (bind mount)`

Defined in `docker-compose.prod.yml`:
- `caddy` service (ports 80/443)
- `webxr-app` service (builds this repo)
- persistent `captures` folder on host

## First deployment

From local repo root:

```bash
./deploy.sh
```

`deploy.sh` does all of the following:
1. Rsync project files to `/opt/webxr-kwhd`
2. Install Docker remotely if missing
3. Create `.env` from `.env.example` if absent
4. Create `captures/`
5. Start/rebuild services with `docker compose up -d --build`

## Normal redeploy

After code changes:

```bash
./deploy.sh
```

## Domain and HTTPS

`Caddyfile` currently uses:

```caddyfile
vr.compilechicken.com {
    reverse_proxy webxr-app:3000
}
```

If domain changes:
1. Update DNS `A` record to point to the server IP.
2. Edit `/opt/webxr-kwhd/Caddyfile` with the new host.
3. Restart Caddy:
   ```bash
   cd /opt/webxr-kwhd
   docker compose restart caddy
   ```

## Environment variables

Set in `/opt/webxr-kwhd/.env`:

```env
PORT=3000
DOWNLOADS_USER=admin
DOWNLOADS_PASS=changeme
```

Change `DOWNLOADS_PASS` before exposing `/downloads` publicly.

## Operations

```bash
cd /opt/webxr-kwhd

docker compose ps
docker compose logs -f
docker compose logs -f webxr-app
docker compose logs -f caddy
docker compose restart
docker compose down && docker compose up -d --build
ls -lah captures/
```
