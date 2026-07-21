#!/usr/bin/env bash
# Install Physical Media Launcher into Decky on SteamOS / Steam Deck.
# Run in Desktop Mode Konsole as the deck user.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="PhysicalMediaLauncher"
USER_NAME="$(id -un)"
HOMEBREW_DIR="${HOME}/homebrew"
PLUGINS_DIR="${HOMEBREW_DIR}/plugins"
TARGET="${PLUGINS_DIR}/${PLUGIN_NAME}"

echo "==> Running as: ${USER_NAME}"
echo "==> Home: ${HOME}"

fix_owner() {
  local path="$1"
  if [[ -e "${path}" ]] && [[ ! -w "${path}" ]]; then
    echo "==> Fixing permissions on ${path} (needs sudo password)..."
    sudo chown -R "${USER_NAME}:${USER_NAME}" "${path}"
    sudo chmod -R u+rwX "${path}" || true
  fi
}

echo "==> Checking Decky homebrew folder..."
if [[ ! -d "${HOMEBREW_DIR}" ]]; then
  echo "ERROR: ${HOMEBREW_DIR} not found."
  echo "Install Decky Loader first: https://github.com/SteamDeckHomebrew/decky-loader"
  exit 1
fi

fix_owner "${HOMEBREW_DIR}"

if [[ ! -w "${HOMEBREW_DIR}" ]]; then
  echo "ERROR: still cannot write to ${HOMEBREW_DIR}"
  echo "Run this, then retry:"
  echo "  sudo chown -R ${USER_NAME}:${USER_NAME} ${HOMEBREW_DIR}"
  exit 1
fi

mkdir -p "${PLUGINS_DIR}"
fix_owner "${PLUGINS_DIR}"

echo "==> Installing plugin to ${TARGET}"
rm -rf "${TARGET}"
mkdir -p "${TARGET}"

copy_plugin() {
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude '.git' \
      --exclude 'node_modules' \
      --exclude '.rollup.cache' \
      --exclude '__pycache__' \
      --exclude 'tests' \
      "${SCRIPT_DIR}/" "${TARGET}/"
  else
    # Steam Deck often has no rsync; plain cp works fine.
    cp -a "${SCRIPT_DIR}/." "${TARGET}/"
    rm -rf \
      "${TARGET}/.git" \
      "${TARGET}/node_modules" \
      "${TARGET}/.rollup.cache" \
      "${TARGET}/__pycache__" \
      "${TARGET}/tests" || true
  fi
}

copy_plugin

if [[ ! -f "${TARGET}/dist/index.js" ]]; then
  echo "WARNING: dist/index.js missing. Frontend may not load."
fi

mkdir -p "${HOME}/Games"
chmod u+rwx "${HOME}/Games" || true

echo "==> Installed OK."
echo "Files are in: ${TARGET}"
echo
echo "Next:"
echo "  1. Return to Game Mode"
echo "  2. Decky menu -> reload plugins (or reboot)"
echo "  3. Open Physical Media Launcher"
echo "  4. Rescan -> Start Transfer (SD → SSD)"
