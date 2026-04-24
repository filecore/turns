#!/bin/bash
sed -i 's/\r//' "$0" 2>/dev/null || true
set -e

GAME_NAME="turns"
GAMES_ROOT="/mnt/c/Users/JasonTogneri/games/games"
DEST="${GAMES_ROOT}/${GAME_NAME}"
REMOTE="oxide@192.168.0.101:/home/oxide/docker/nginx/nginx-subdomain-togneri-games/www-data/games/"

mkdir -p "${DEST}"
rsync -av --checksum --delete src/ "${DEST}/"

[ -f thumbnail.png ] && cp thumbnail.png "${DEST}/thumbnail.png"

MANIFEST="${GAMES_ROOT}/manifest.json"
if [ -f "${MANIFEST}" ] && ! grep -q '"turns"' "${MANIFEST}"; then
  python3 - "${MANIFEST}" <<'EOF'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
data.append({"name":"turns","title":"TURNS","description":"1v1 roguelite shooter — steal cards, escalate mayhem. Fan remake of ROUNDS by Landfall Games."})
with open(sys.argv[1], 'w') as f:
    json.dump(data, f, indent=2)
print("Manifest updated.")
EOF
fi

echo ""
echo "Staged to ${DEST}"
echo "Syncing all games to remote..."
rsync -av --delete "${GAMES_ROOT}/" "${REMOTE}"
echo ""
echo "Done. https://games.togneri.net/games/turns"
