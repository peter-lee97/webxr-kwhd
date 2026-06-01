# WebXR KWHD

A Three.js/WebXR forest experience with interactive voxel cats, camera capture, and capture-management UIs.

## Quick start (local development)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Generate local HTTPS certs (required by this Vite config):
   ```bash
   ./generate-cert.sh
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open `https://localhost:5173` and accept the browser certificate warning once.

For cert details and manual OpenSSL commands, see [HTTPS_SETUP.md](./HTTPS_SETUP.md).

## Run locally in production mode

```bash
npm run build
npm start
```

Then open:
- App: `http://localhost:3000/`
- Dashboard: `http://localhost:3000/dashboard`
- Gallery: `http://localhost:3000/gallery`

## How to use

### Core interactions

- Click/tap cats to interact.
- Use the speaker button to mute/unmute audio.
- Open the catalog with the grid icon (`#catalog-toggle`).
- Open controls reference with the `?` button.

### Camera and captures

- Toggle viewfinder with the camera button (mobile) or XR controls.
- `Space`: capture when viewfinder is active.
- `C`: cycle lens preset.
- Captures save to the server (`/save-capture`); if save fails, the app falls back to downloading the PNG locally.

### Navigation controls

- Desktop: drag to rotate camera, mouse wheel to zoom.
- Mobile: on-screen joystick/buttons and quick panel.
- XR: use headset button to enter VR; controller mappings are shown in-app.

## Deploy

### Option A: one-command server deploy (current Hetzner flow)

```bash
./deploy.sh
```

This syncs the repo to `/opt/webxr-kwhd` on the configured server, ensures Docker is present, and starts `docker compose` with Caddy + app containers.

### Option B: manual Docker deployment

```bash
docker build -t webxr-kwhd .
docker run -p 3000:3000 \
  -v ./captures:/app/captures \
  --env-file .env \
  webxr-kwhd
```

Use a reverse proxy (Caddy/Nginx/Traefik) for HTTPS in production.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Express server port |
| `DOWNLOADS_USER` | `admin` | Basic-auth username for `/downloads*` |
| `DOWNLOADS_PASS` | `changeme` | Basic-auth password for `/downloads*` |

Copy from template:

```bash
cp .env.example .env
```

## Useful docs

- [deployment.md](./deployment.md) — production runbook for Caddy + Docker Compose
- [SERVER_README.md](./SERVER_README.md) — Express routes, auth, and capture API
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — rendering/browser diagnostics
