#!/usr/bin/env bash
# Hard reinstall + Decky restart for Physical Media Launcher.
set -euo pipefail

USER_NAME="$(id -un)"
HOME_DIR="${HOME:-/home/deck}"
TARGET="${HOME_DIR}/homebrew/plugins/PhysicalMediaLauncher"
BRANCH="cursor/physical-media-launcher-006e"
REPO_URL="https://github.com/tanayabhay-creator/physical-game-plugin-.git"
WORK="/tmp/pml-hard-$$"

if [[ "${USER_NAME}" == "root" ]]; then
  echo "Do not run as root."
  exit 1
fi

cd /tmp
echo "==> Removing old plugin folders..."
rm -rf "${TARGET}"
# Catch accidental alternate folder names from earlier installs.
rm -rf "${HOME_DIR}/homebrew/plugins/physical-media-launcher" \
       "${HOME_DIR}/homebrew/plugins/physical-game-plugin-" \
       "${HOME_DIR}/homebrew/plugins/PhysicalMediaLauncher-" || true

echo "==> Downloading ${BRANCH}..."
rm -rf "${WORK}"
mkdir -p "${WORK}"
git clone --branch "${BRANCH}" --single-branch "${REPO_URL}" "${WORK}/repo"

echo "==> Installing..."
mkdir -p "${HOME_DIR}/homebrew/plugins"
cp -a "${WORK}/repo/." "${TARGET}/"
rm -rf "${TARGET}/.git" "${TARGET}/node_modules" "${TARGET}/tests" || true
sudo chown -R "${USER_NAME}:${USER_NAME}" "${TARGET}" 2>/dev/null || true

echo "==> Verify files:"
ls -la "${TARGET}/main.py" "${TARGET}/dist/index.js"
grep -n "2026-07-21-launch3" "${TARGET}/main.py" | head -3 || {
  echo "ERROR: new main.py marker not found"
  exit 1
}

echo "==> Restarting Decky plugin loader..."
if systemctl list-unit-files 2>/dev/null | grep -q plugin_loader.service; then
  sudo systemctl restart plugin_loader.service
elif systemctl list-unit-files 2>/dev/null | grep -q decky-loader; then
  sudo systemctl restart decky-loader.service || sudo systemctl restart plugin_loader
else
  # Fallback used on many Decky installs
  sudo systemctl restart plugin_loader.service || true
fi

rm -rf "${WORK}" || true
echo
echo "SUCCESS."
echo "In Game Mode: open Physical Media Launcher"
echo "Plugin build must show: 2026-07-21-launch3"
echo "Then press Start Transfer once, then Launch last game now."
