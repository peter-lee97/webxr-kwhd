# WebXR KWHD - deployment runbook

## Production target

| Key | Value |
|---|---|
| Server | shared prod server, SSH alias `mc.prod` |
| Host | `195.201.224.167` (Hetzner, hostname `debian-4gb-nbg1-1`) |
| Subdomain | `vr.compilechicken.com` |
| Server directory | `~/webxr/` |
| Host port | `127.0.0.1:4100` forwards to container port 3000 |
| TLS | host Caddy via `/etc/caddy/sites-enabled/webxr.caddy` |

The server is shared with other apps.
Do not touch their containers, Caddy site files, or ports
(`3000`, `4000`, `4001`, `4080`, `7350`, `7777`, `8000`, `8787` are taken).

## Stack

`Internet -> host Caddy (TLS 443) -> localhost:4100 -> webxr-kwhd container (Express on 3000) -> ./captures bind mount`

Caddy is a host service on the server.
This repo does not run its own Caddy container in production.
The in-repo `Caddyfile` is the template for the server's site file.

## First-time setup (already done, kept for reference)

1. DNS A record `vr.compilechicken.com` pointing at `195.201.224.167`.
2. On the server: `~/webxr/` with `docker-compose.prod.yml`, `captures/`, and a manually created `.env`.
3. `.env` contents (server only, never committed, never scp'd):

```env
PORT=3000
DOWNLOADS_USER=admin
DOWNLOADS_PASS=<strong password>
CAPTURES_MAX_FILES=500
```

4. Caddy site file `/etc/caddy/sites-enabled/webxr.caddy` from this repo's `Caddyfile`:

```caddyfile
vr.compilechicken.com {
    reverse_proxy localhost:4100
}
```

Install and reload Caddy (needs sudo password):

```bash
sudo cp Caddyfile /etc/caddy/sites-enabled/webxr.caddy
sudo systemctl reload caddy
```

Reload, never restart, so other sites keep serving.

## Deploy

From the repo root:

```bash
./deploy.sh
```

What it does:

1. Builds `webxr-kwhd:latest` locally.
2. Saves the image as a gzipped tarball.
3. scp's the tarball plus `docker-compose.prod.yml` to `mc.prod:/tmp/`.
4. On the server: copies the compose file into `~/webxr/`, `docker load`s the image, and runs `docker compose -f docker-compose.prod.yml up -d`.
5. Removes the transfer artifacts and prunes unused Docker objects.

Secrets never leave the server.
If `~/webxr/.env` is missing, the deploy aborts with instructions.

## Verify after every deploy

```bash
curl -s https://vr.compilechicken.com/health
curl -I https://vr.compilechicken.com
curl -s "https://vr.compilechicken.com/gallery/files/..%2fpackage.json" -o /dev/null -w "%{http_code}\n"   # expect 400
```

On the server:

```bash
docker compose -f ~/webxr/docker-compose.prod.yml ps
docker compose -f ~/webxr/docker-compose.prod.yml logs --tail 50
```

## Operations on the server

```bash
cd ~/webxr

docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml restart
docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d
ls -lah captures/
```

## Rollback

Keep the previous image tarball before deploying.
To roll back, `docker load` the old tarball and run `docker compose -f docker-compose.prod.yml up -d` again.
