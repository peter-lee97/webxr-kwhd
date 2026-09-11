#!/usr/bin/env bash
# deploy.sh — build webxr-kwhd locally and deploy to the shared prod server (mc.prod)
set -euo pipefail

SERVER="mc.prod"
IMAGE="webxr-kwhd:latest"
TARBALL="/tmp/webxr-kwhd.tar.gz"

echo "▶ Building image ${IMAGE} ..."
docker build -t "$IMAGE" .

echo "▶ Exporting image to ${TARBALL} ..."
docker save "$IMAGE" | gzip > "$TARBALL"

echo "▶ Copying image and compose file to ${SERVER}:/tmp/ ..."
scp -q "$TARBALL" docker-compose.prod.yml "$SERVER:/tmp/"

echo "▶ Deploying on ${SERVER} ..."
ssh "$SERVER" bash -s << 'REMOTE'
set -euo pipefail

REMOTE_DIR="$HOME/webxr"
mkdir -p "$REMOTE_DIR/captures"
cp /tmp/docker-compose.prod.yml "$REMOTE_DIR/docker-compose.prod.yml"

if [ ! -f "$REMOTE_DIR/.env" ]; then
  echo ""
  echo "✋ $REMOTE_DIR/.env is missing. Create it manually on the server (never scp it):"
  echo "   PORT=3000"
  echo "   DOWNLOADS_USER=admin"
  echo "   DOWNLOADS_PASS=<strong password>"
  echo "   CAPTURES_MAX_FILES=500"
  echo "Aborting deploy. Fix .env, then re-run ./deploy.sh"
  exit 1
fi

cd "$REMOTE_DIR"
docker load -i /tmp/webxr-kwhd.tar.gz
docker compose -f docker-compose.prod.yml up -d
rm -f /tmp/webxr-kwhd.tar.gz /tmp/docker-compose.prod.yml
docker system prune -f

echo ""
echo "✅ Remote status:"
docker compose -f docker-compose.prod.yml ps
REMOTE

rm -f "$TARBALL"

echo ""
echo "✅ Deployment complete!"
echo "   App:      https://vr.compilechicken.com"
echo "   Health:   curl -s https://vr.compilechicken.com/health"
