#!/usr/bin/env bash
# deploy.sh — sync files and (re)build on Hetzner server
set -euo pipefail

SERVER="root@49.12.186.48"
SSH_KEY=".ssh/hetzner_id"
REMOTE_DIR="/opt/webxr-kwhd"

echo "▶ Syncing files to $SERVER:$REMOTE_DIR ..."
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.env' \
  --exclude='.ssh' \
  --exclude='*.pem' \
  --exclude='captures' \
  --exclude='.DS_Store' \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
  ./ "$SERVER:$REMOTE_DIR/"

echo "▶ Running remote setup ..."
ssh -i "$SSH_KEY" "$SERVER" bash << 'REMOTE'
set -euo pipefail

# Install Docker if not present
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

cd /opt/webxr-kwhd

# Create .env from example if it doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠  Created .env from .env.example — edit /opt/webxr-kwhd/.env to set DOWNLOADS_PASS"
fi

# Create captures dir on host
mkdir -p captures

# Use production compose file
cp docker-compose.prod.yml docker-compose.yml

# Build and start
docker compose up -d --build

echo "✅ Done. Services:"
docker compose ps
REMOTE

echo ""
echo "✅ Deployment complete!"
echo "   App: http://49.12.186.48"
echo "   SSH: ssh -i .ssh/hetzner_id root@49.12.186.48"
