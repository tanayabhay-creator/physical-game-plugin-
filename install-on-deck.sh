#!/usr/bin/env bash
# Install Physical Media Launcher into Decky on SteamOS / Steam Deck.
# Run in Desktop Mode Konsole as the deck user (no sudo required for plugin install).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="PhysicalMediaLauncher"
HOMEBREW_DIR="${HOME}/homebrew"
PLUGINS_DIR="${HOMEBREW_DIR}/plugins"
TARGET="${PLUGINS_DIR}/${PLUGIN_NAME}"

echo "==> Checking Decky homebrew folder..."
if [[ ! -d "${HOMEBREW_DIR}" ]]; then
  echo "ERROR: ${HOMEBREW_DIR} not found."
  echo "Install Decky Loader first, then re-run this script."
  echo "https://github.com/SteamDeckHomebrew/decky-loader"
  exit 1
fi

if [[ ! -w "${HOMEBREW_DIR}" ]]; then
  echo "ERROR: ${HOMEBREW_DIR} is not writable by $(whoami)."
  echo "Fix ownership with:"
  echo "  sudo chown -R deck:deck \"${HOMEBREW_DIR}\""
  exit 1
fi

mkdir -p "${PLUGINS_DIR}"

echo "==> Installing plugin to ${TARGET}"
rm -rf "${TARGET}"
mkdir -p "${TARGET}"

# Copy plugin files; skip local tooling that is not needed at runtime.
rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.rollup.cache' \
  --exclude '__pycache__' \
  --exclude 'tests' \
  "${SCRIPT_DIR}/" "${TARGET}/"

if [[ ! -f "${TARGET}/dist/index.js" ]]; then
  echo "WARNING: dist/index.js missing. Build on a PC with: pnpm i && pnpm run build"
fi

# Ensure Games destination folder exists and is writable.
mkdir -p "${HOME}/Games"
chmod u+rwx "${HOME}/Games"

echo "==> Installed."
echo "Next:"
echo "  1. Return to Game Mode"
echo "  2. Open Decky menu -> reload plugins (or reboot)"
echo "  3. Open 'Physical Media Launcher'"
echo
echo "Do NOT copy helpers into /usr/local on SteamOS (read-only root)."
echo "The built-in media poller works without udev rules."
