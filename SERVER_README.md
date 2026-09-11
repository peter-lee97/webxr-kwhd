# Server/API reference

This project has two server modes:

1. **Development (`npm run dev`)**: Vite HTTPS dev server + middleware routes from `vite.config.js`
2. **Production (`npm run build && npm start`)**: Express server from `server.js`

Both modes support saving captures and listing/downloading files.

## Setup

```bash
npm install
cp .env.example .env
```

`.env`:

```env
DOWNLOADS_USER=admin
DOWNLOADS_PASS=changeme
PORT=3000
CAPTURES_MAX_FILES=500
```

## App routes

- `GET /` — main app
- `GET /dashboard` — capture management dashboard
- `GET /gallery` — public gallery view
- `GET /health` — liveness check, returns `{"ok":true}`

## Capture routes (production / Express)

### POST `/save-capture`

Request body:

```json
{ "dataUrl": "data:image/png;base64,..." }
```

Notes:
- `server.js` uses `dataUrl` and generates a unique filename automatically.
- Client currently also sends `name`; this is ignored safely by Express.
- Rate limited to 30 requests per IP per 5 minutes.
- Filename params in all routes must match `^[A-Za-z0-9._-]+\.png$`; anything else returns 400.
- When capture count exceeds `CAPTURES_MAX_FILES` (default 500), the oldest PNG files are pruned automatically.

### GET `/downloads` (basic auth required)

Returns:

```json
{
  "files": [
    {
      "name": "capture-1730000000000.png",
      "url": "/downloads/capture-1730000000000.png",
      "size": 929079,
      "modified": "2026-05-06T15:48:30.342Z"
    }
  ]
}
```

### GET `/downloads/:filename` (basic auth required)

Serves the image file if it exists.

### DELETE `/downloads/:filename` (basic auth required)

Deletes one file:

```json
{ "success": true }
```

### GET `/gallery/files`

Public listing for gallery page.

### GET `/gallery/files/:filename`

Serves image file for gallery.

### GET `/gallery/download/:filename`

Forces browser download of gallery image.

## Auth usage example

```bash
AUTH=$(echo -n "admin:changeme" | base64)
curl -H "Authorization: Basic $AUTH" http://localhost:3000/downloads
```

## Run commands

Development:

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```