# WebXR KWHD — Production Deployment

## Server

| Key | Value |
|---|---|
| IP | `49.12.186.48` |
| Domain | `vr.compilechicken.com` |
| Provider | Hetzner Cloud |
| SSH Key | `.ssh/hetzner_id` |
| SSH User | `root` |

```bash
ssh -i .ssh/hetzner_id root@49.12.186.48
```

## Architecture

```
Internet
  ↓ :80 (HTTP) / :443 (HTTPS)
Caddy (reverse proxy + auto TLS)
  ↓ internal Docker network
webxr-kwhd (Express, port 3000)
  ↓ bind-mount
./captures/
```

## Prerequisites

> **HTTPS / WebXR note:** WebXR requires HTTPS. Caddy will auto-provision a Let's Encrypt certificate once you point a domain at this server and update `Caddyfile` with the domain. Without a domain, the server runs on HTTP only (suitable for initial testing).

## Initial Deploy

```bash
# From your local machine:
./deploy.sh
```

The deploy script will:
1. Rsync source files to the server
2. Install Docker (if needed)
3. Build the Docker image on the server
4. Start Caddy + the app via Docker Compose

## Adding a Domain (for HTTPS / WebXR)

1. Point an `A` record at `49.12.186.48` (e.g., `app.yourdomain.com`)
2. Edit `Caddyfile` on the server — replace `:80` with your domain:
   ```caddyfile
   app.yourdomain.com {
       reverse_proxy webxr-app:3000
   }
   ```
3. Restart Caddy:
   ```bash
   ssh -i .ssh/hetzner_id root@49.12.186.48
   cd /opt/webxr-kwhd
   docker compose restart caddy
   ```

## Re-deploy After Code Changes

```bash
./deploy.sh
```

This syncs changed files and rebuilds the image on the server.

## Environment Variables

Override in `/opt/webxr-kwhd/.env` on the server:

```env
PORT=3000
DOWNLOADS_USER=admin
DOWNLOADS_PASS=changeme   # ← change this!
```

## Useful Commands (on server)

```bash
cd /opt/webxr-kwhd

docker compose ps                    # status
docker compose logs -f               # all logs
docker compose logs -f webxr-app     # app logs
docker compose logs -f caddy         # proxy logs

# Restart
docker compose restart

# Full rebuild
docker compose down && docker compose up -d --build

# View captures
ls captures/
```
