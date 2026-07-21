#!/usr/bin/env bash
# One-shot update/reinstall for Steam Deck.
# ALWAYS applies the ~/homebrew permission fix before installing.
set -euo pipefail

USER_NAME="$(id -un)"
HOME_DIR="${HOME:-/home/deck}"
DOWNLOADS="${HOME_DIR}/Downloads"
REPO_DIR="${DOWNLOADS}/physical-game-plugin-"
REPO_URL="https://github.com/tanayabhay-creator/physical-game-plugin-.git"
BRANCH="cursor/physical-media-launcher-006e"

echo "==> SteamOS permission fix first..."
sudo chown -R "${USER_NAME}:${USER_NAME}" "${HOME_DIR}/homebrew" 2>/dev/null || true
if [[ -d "${HOME_DIR}/homebrew" ]]; then
  sudo chown -R "${USER_NAME}:${USER_NAME}" "${HOME_DIR}/homebrew"
  sudo chmod -R u+rwX "${HOME_DIR}/homebrew"
fi
mkdir -p "${DOWNLOADS}" "${HOME_DIR}/Games"
sudo chown -R "${USER_NAME}:${USER_NAME}" "${DOWNLOADS}" "${HOME_DIR}/Games" 2>/dev/null || true

echo "==> Fetching plugin source..."
cd "${DOWNLOADS}"
rm -rf "${REPO_DIR}"
git clone "${REPO_URL}" "${REPO_DIR}"
cd "${REPO_DIR}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}" || true

chmod +x ./install-on-deck.sh
./install-on-deck.sh

echo "==> Update complete."
