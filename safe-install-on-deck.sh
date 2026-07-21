#!/usr/bin/env bash
# Bulletproof Steam Deck reinstall. Fixes ownership first, installs from /tmp.
set -euo pipefail

USER_NAME="$(id -un)"
HOME_DIR="${HOME:-/home/deck}"
REPO_URL="https://github.com/tanayabhay-creator/physical-game-plugin-.git"
BRANCH="cursor/physical-media-launcher-006e"
WORK_DIR="/tmp/pml-install-${USER_NAME}"
PLUGIN_NAME="PhysicalMediaLauncher"
HOMEBREW_DIR="${HOME_DIR}/homebrew"
TARGET="${HOMEBREW_DIR}/plugins/${PLUGIN_NAME}"

echo "======================================================"
echo " Physical Media Launcher — SteamOS safe installer"
echo "======================================================"
echo "User: ${USER_NAME}"
echo "Home: ${HOME_DIR}"
echo

if [[ "${USER_NAME}" == "root" ]]; then
  echo "ERROR: Do not run this as root / with sudo."
  echo "Run it as the deck user, and only enter your password when sudo asks."
  exit 1
fi

echo "==> [1/5] Fixing ownership (sudo password may be required)..."
# Fix common root-owned leftovers from earlier failed installs.
sudo chown -R "${USER_NAME}:${USER_NAME}" \
  "${HOME_DIR}/homebrew" \
  "${HOME_DIR}/Downloads" \
  "${HOME_DIR}/Games" \
  "${HOME_DIR}/Downloads/physical-game-plugin-" \
  /tmp/pml-install-* \
  2>/dev/null || true

if [[ -d "${HOME_DIR}/homebrew" ]]; then
  sudo chown -R "${USER_NAME}:${USER_NAME}" "${HOME_DIR}/homebrew"
  sudo chmod -R u+rwX "${HOME_DIR}/homebrew"
fi

mkdir -p "${HOME_DIR}/Games" "${HOME_DIR}/Downloads" "${HOME_DIR}/homebrew/plugins"
sudo chown -R "${USER_NAME}:${USER_NAME}" \
  "${HOME_DIR}/Games" \
  "${HOME_DIR}/Downloads" \
  "${HOME_DIR}/homebrew"
chmod -R u+rwX "${HOME_DIR}/Games" "${HOME_DIR}/Downloads" "${HOME_DIR}/homebrew"

if [[ ! -d "${HOME_DIR}/homebrew" ]]; then
  echo "ERROR: ${HOME_DIR}/homebrew not found. Install Decky Loader first."
  exit 1
fi

if [[ ! -w "${HOME_DIR}/homebrew/plugins" ]]; then
  echo "ERROR: still cannot write to ${HOME_DIR}/homebrew/plugins"
  echo "Run: sudo chown -R ${USER_NAME}:${USER_NAME} ${HOME_DIR}/homebrew"
  exit 1
fi

echo "==> [2/5] Downloading plugin into ${WORK_DIR} ..."
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"
git clone --branch "${BRANCH}" --single-branch "${REPO_URL}" "${WORK_DIR}/repo"
cd "${WORK_DIR}/repo"

echo "==> [3/5] Installing into ${TARGET} ..."
rm -rf "${TARGET}"
mkdir -p "${TARGET}"

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.rollup.cache' \
    --exclude '__pycache__' \
    --exclude 'tests' \
    ./ "${TARGET}/"
else
  cp -a ./. "${TARGET}/"
  rm -rf "${TARGET}/.git" "${TARGET}/node_modules" "${TARGET}/.rollup.cache" \
    "${TARGET}/__pycache__" "${TARGET}/tests" || true
fi

sudo chown -R "${USER_NAME}:${USER_NAME}" "${TARGET}"
chmod -R u+rwX "${TARGET}"

echo "==> [4/5] Verifying ..."
if [[ ! -f "${TARGET}/main.py" ]]; then
  echo "ERROR: main.py missing after install"
  exit 1
fi
if [[ ! -f "${TARGET}/dist/index.js" ]]; then
  echo "WARNING: dist/index.js missing (UI may not load)"
fi

echo "==> [5/5] Cleanup work dir"
rm -rf "${WORK_DIR}"

echo
echo "======================================================"
echo " SUCCESS — plugin installed to:"
echo " ${TARGET}"
echo "======================================================"
echo "Next:"
echo "  1. Go to Game Mode"
echo "  2. Decky menu -> reload plugins"
echo "  3. Open Physical Media Launcher"
echo "  4. Rescan -> Start Transfer"
echo
