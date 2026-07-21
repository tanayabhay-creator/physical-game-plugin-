#!/usr/bin/env bash
# Rewrite a valid game_info.json onto a mounted SD/USB card.
# Usage:
#   bash write-game-info-on-sd.sh /run/media/deck/YOURLABEL MyGame game.exe
set -euo pipefail

CARD="${1:-}"
GAME_FOLDER="${2:-MyGame}"
EXE_PATH="${3:-game.exe}"
GAME_NAME="${4:-My Game}"

if [[ -z "${CARD}" ]]; then
  echo "Mounted cards:"
  ls -1 /run/media/deck 2>/dev/null || echo "(none)"
  echo
  echo "Usage:"
  echo "  bash write-game-info-on-sd.sh /run/media/deck/LABEL GameFolder exeName [GameName]"
  echo "Example:"
  echo "  bash write-game-info-on-sd.sh /run/media/deck/A1B2-C3D4 MyGame game.exe \"My Game\""
  exit 1
fi

if [[ ! -d "${CARD}" ]]; then
  echo "ERROR: card path not found: ${CARD}"
  exit 1
fi

mkdir -p "${CARD}/${GAME_FOLDER}"

cat > "${CARD}/game_info.json" <<EOF
{
  "GameName": "${GAME_NAME}",
  "GameFolder": "${GAME_FOLDER}",
  "ExePath": "${EXE_PATH}",
  "LaunchOptions": "",
  "TargetSSDPath": "/home/deck/Games/${GAME_FOLDER}",
  "AutoLaunch": false
}
EOF

echo "Wrote ${CARD}/game_info.json"
echo "----"
cat "${CARD}/game_info.json"
echo "----"
echo "Game folder: ${CARD}/${GAME_FOLDER}"
ls -la "${CARD}/${GAME_FOLDER}" || true
echo
echo "Make sure your real exe exists at:"
echo "  ${CARD}/${GAME_FOLDER}/${EXE_PATH}"
