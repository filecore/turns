#!/bin/bash
sed -i 's/\r//' "$0" 2>/dev/null || true
set -e

CONFIG_FILE="$(dirname "$0")/.deploy.conf"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "First run: no deployment config found."
  echo ""
  read -p "SSH user@host (e.g. oxide@192.168.0.101): " SSH_HOST
  read -p "Remote web root path (e.g. /home/oxide/docker/nginx/turns/www-data/turns/): " REMOTE_WEB_ROOT
  read -p "Remote relay directory (e.g. /home/oxide/docker/nginx/turns/relay): " REMOTE_RELAY_DIR
  read -p "Remote Docker Compose directory (e.g. /home/oxide/docker/nginx/turns): " REMOTE_COMPOSE_DIR
  read -p "Relay service name in docker-compose.yml (e.g. relay): " RELAY_SERVICE
  read -p "Domain name (e.g. games.togneri.net/games/turns): " DOMAIN

  cat > "$CONFIG_FILE" <<EOF
SSH_HOST="$SSH_HOST"
REMOTE_WEB_ROOT="$REMOTE_WEB_ROOT"
REMOTE_RELAY_DIR="$REMOTE_RELAY_DIR"
REMOTE_COMPOSE_DIR="$REMOTE_COMPOSE_DIR"
RELAY_SERVICE="$RELAY_SERVICE"
DOMAIN="$DOMAIN"
EOF
  echo ""
  echo "Config saved to .deploy.conf"
  echo ""
fi

source "$CONFIG_FILE"

echo ""
echo "Pushing to GitHub..."
git push
echo "GitHub updated."

echo ""
echo "Syncing game files to ${DOMAIN}..."
rsync -av --checksum --delete src/ "${SSH_HOST}:${REMOTE_WEB_ROOT}"

echo ""
echo "Done. Game updated."

if [ -d relay ]; then
  echo ""
  echo "Deploying relay server..."
  rsync -av relay/ "${SSH_HOST}:${REMOTE_RELAY_DIR}/"
  ssh "${SSH_HOST}" \
    "cd ${REMOTE_COMPOSE_DIR} && docker compose up -d --build ${RELAY_SERVICE} 2>&1 | tail -5"
  echo "Relay deployed."
fi
