#!/bin/bash
sed -i 's/\r//' "$0" 2>/dev/null || true
set -e

GAME_NAME="turns"
CONFIG_FILE="$(dirname "$0")/.deploy.conf"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "First run: no deployment config found."
  echo ""
  read -p "Local games portal root (e.g. /home/you/games/games): " GAMES_ROOT
  read -p "SSH remote games root (e.g. user@host:/srv/nginx/games/www/games/): " REMOTE_GAMES
  read -p "Remote relay directory (e.g. user@host:/srv/nginx/games/relay): " REMOTE_RELAY
  read -p "Remote Docker Compose directory for relay (e.g. user@host:/srv/nginx/games): " REMOTE_COMPOSE
  read -p "Relay service name in docker-compose.yml (e.g. turns-relay): " RELAY_SERVICE
  read -p "Remote nginx conf path to update (e.g. user@host:/srv/nginx/games/conf/default.conf): " REMOTE_NGINX_CONF

  cat > "$CONFIG_FILE" <<EOF
GAMES_ROOT="$GAMES_ROOT"
REMOTE_GAMES="$REMOTE_GAMES"
REMOTE_RELAY="$REMOTE_RELAY"
REMOTE_COMPOSE="$REMOTE_COMPOSE"
RELAY_SERVICE="$RELAY_SERVICE"
REMOTE_NGINX_CONF="$REMOTE_NGINX_CONF"
EOF
  echo ""
  echo "Config saved to .deploy.conf"
  echo ""
fi

source "$CONFIG_FILE"

DEST="${GAMES_ROOT}/${GAME_NAME}"

if git remote | grep -q .; then
  echo "Pushing to GitHub..."
  git push
else
  echo "No git remote configured, skipping GitHub push."
fi

mkdir -p "${DEST}"
echo "Syncing game files..."
rsync -av --checksum --delete src/ "${DEST}/"
[ -f thumbnail.png ] && cp thumbnail.png "${DEST}/thumbnail.png"

MANIFEST="${GAMES_ROOT}/manifest.json"
if [ -f "${MANIFEST}" ] && ! grep -q '"turns"' "${MANIFEST}"; then
  python3 - "${MANIFEST}" <<'EOF'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
data.append({"name":"turns","title":"TURNS","description":"1v1 roguelite shooter -- steal cards, escalate mayhem. Fan remake of ROUNDS by Landfall Games."})
with open(sys.argv[1], 'w') as f:
    json.dump(data, f, indent=2)
print("Manifest updated.")
EOF
fi

echo "Syncing all games to remote..."
rsync -av --delete "${GAMES_ROOT}/" "${REMOTE_GAMES}"
echo "Done."

if [ -d relay ] && [ -n "${REMOTE_RELAY}" ]; then
  SSH_HOST="${REMOTE_RELAY%%:*}"
  RELAY_DIR="${REMOTE_RELAY#*:}"
  COMPOSE_DIR="${REMOTE_COMPOSE#*:}"

  # Only redeploy relay/nginx if files actually changed (checksum comparison)
  # Use grep | wc -l rather than grep -c: wc -l always exits 0, safe with set -e
  RELAY_CHANGES=$(rsync --checksum --itemize-changes --dry-run relay/ "${REMOTE_RELAY}/" 2>/dev/null | grep '^[<>c]' | wc -l)
  CONF_CHANGES=0
  COMPOSE_CHANGES=0
  if [ -n "${REMOTE_NGINX_CONF}" ] && [ -f server/nginx-games-default.conf ]; then
    CONF_CHANGES=$(rsync --checksum --itemize-changes --dry-run server/nginx-games-default.conf "${REMOTE_NGINX_CONF}" 2>/dev/null | grep '^[<>c]' | wc -l)
  fi
  if [ -f server/games-docker-compose.yaml ]; then
    COMPOSE_CHANGES=$(rsync --checksum --itemize-changes --dry-run server/games-docker-compose.yaml "${SSH_HOST}:${COMPOSE_DIR}/docker-compose.yaml" 2>/dev/null | grep '^[<>c]' | wc -l)
  fi

  TOTAL_CHANGES=$((RELAY_CHANGES + CONF_CHANGES + COMPOSE_CHANGES))
  if [ "$TOTAL_CHANGES" -gt 0 ]; then
    echo "Relay/nginx changes detected ($TOTAL_CHANGES file(s)). Deploying..."
    rsync -av relay/ "${REMOTE_RELAY}/"
    if [ -n "${REMOTE_NGINX_CONF}" ] && [ -f server/nginx-games-default.conf ]; then
      rsync -av server/nginx-games-default.conf "${REMOTE_NGINX_CONF}"
    fi
    if [ -f server/games-docker-compose.yaml ]; then
      rsync -av server/games-docker-compose.yaml "${SSH_HOST}:${COMPOSE_DIR}/docker-compose.yaml"
    fi
    ssh "${SSH_HOST}" \
      "cd ${COMPOSE_DIR} && docker compose up -d --build ${RELAY_SERVICE} && docker compose restart nginx-subdomain-togneri-games 2>&1 | tail -8"
    echo "Relay and nginx deployed."
  else
    echo "Relay/nginx unchanged, skipping restart."
  fi
fi
