#!/usr/bin/env bash
# Install Physical Media Launcher into Decky on SteamOS / Steam Deck.
# ALWAYS fixes ~/homebrew permissions first (SteamOS common failure).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="PhysicalMediaLauncher"
USER_NAME="$(id -un)"
HOME_DIR="${HOME:-/home/deck}"
HOMEBREW_DIR="${HOME_DIR}/homebrew"
PLUGINS_DIR="${HOMEBREW_DIR}/plugins"
TARGET="${PLUGINS_DIR}/${PLUGIN_NAME}"

echo "==> Running as: ${USER_NAME}"
echo "==> Home: ${HOME_DIR}"

echo "==> Applying SteamOS permission fix (sudo password may be required)..."
sudo chown -R "${USER_NAME}:${USER_NAME}" "${HOMEBREW_DIR}" 2>/dev/null || true
if [[ -d "${HOMEBREW_DIR}" ]]; then
  sudo chown -R "${USER_NAME}:${USER_NAME}" "${HOMEBREW_DIR}"
  sudo chmod -R u+rwX "${HOMEBREW_DIR}"
fi
mkdir -p "${HOME_DIR}/Games" "${HOME_DIR}/Downloads"
sudo chown -R "${USER_NAME}:${USER_NAME}" "${HOME_DIR}/Games" "${HOME_DIR}/Downloads" 2>/dev/null || true
chmod -R u+rwX "${HOME_DIR}/Games" "${HOME_DIR}/Downloads" 2>/dev/null || true

echo "==> Checking Decky homebrew folder..."
if [[ ! -d "${HOMEBREW_DIR}" ]]; then
  echo "ERROR: ${HOMEBREW_DIR} not found."
  echo "Install Decky Loader first: https://github.com/SteamDeckHomebrew/decky-loader"
  exit 1
fi

if [[ ! -w "${HOMEBREW_DIR}" ]]; then
  echo "ERROR: still cannot write to ${HOMEBREW_DIR} after chown."
  echo "Try: sudo chown -R ${USER_NAME}:${USER_NAME} ${HOMEBREW_DIR}"
  exit 1
fi

mkdir -p "${PLUGINS_DIR}"

echo "==> Installing plugin to ${TARGET}"
rm -rf "${TARGET}"
mkdir -p "${TARGET}"

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.rollup.cache' \
    --exclude '__pycache__' \
    --exclude 'tests' \
    "${SCRIPT_DIR}/" "${TARGET}/"
else
  cp -a "${SCRIPT_DIR}/." "${TARGET}/"
  rm -rf \
    "${TARGET}/.git" \
    "${TARGET}/node_modules" \
    "${TARGET}/.rollup.cache" \
    "${TARGET}/__pycache__" \
    "${TARGET}/tests" || true
fi

# Ensure plugin files are owned by the deck user even if script was run oddly.
sudo chown -R "${USER_NAME}:${USER_NAME}" "${TARGET}"
chmod -R u+rwX "${TARGET}"

if [[ ! -f "${TARGET}/dist/index.js" ]]; then
  echo "WARNING: dist/index.js missing. Frontend may not load."
fi

echo "==> Installed OK."
echo "Files are in: ${TARGET}"
echo
echo "Next:"
echo "  1. Return to Game Mode"
echo "  2. Decky menu -> reload plugins (or reboot)"
echo "  3. Open Physical Media Launcher"
echo "  4. Rescan -> Start Transfer (SD → SSD)"
