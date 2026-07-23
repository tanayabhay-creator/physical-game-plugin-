#!/usr/bin/env bash
# Hard reinstall + Decky restart for Physical Media Launcher.
# ALWAYS fixes ownership first (SteamOS Permission denied).
set -euo pipefail

USER_NAME="$(id -un)"
HOME_DIR="${HOME:-/home/deck}"
PLUGINS_DIR="${HOME_DIR}/homebrew/plugins"
TARGET="${PLUGINS_DIR}/PhysicalMediaLauncher"
BRANCH="${PML_BRANCH:-v1.0.4}"
REPO_URL="https://github.com/tanayabhay-creator/physical-game-plugin-.git"
WORK="/tmp/pml-hard-${USER_NAME}-$$"

echo "======================================================"
echo " Physical Media Launcher — HARD REINSTALL"
echo "======================================================"

if [[ "${USER_NAME}" == "root" ]]; then
  echo "ERROR: Do not run this whole script with sudo."
  echo "Run as deck user. Only enter password when sudo asks."
  exit 1
fi

# Leave any broken cwd.
cd /tmp || cd "${HOME_DIR}" || true

echo "==> [1/6] Fixing ownership (sudo password may be required)..."
sudo chown -R "${USER_NAME}:${USER_NAME}" \
  "${HOME_DIR}/homebrew" \
  "${HOME_DIR}/Downloads" \
  "${HOME_DIR}/Games" \
  2>/dev/null || true

if [[ -d "${HOME_DIR}/homebrew" ]]; then
  sudo chown -R "${USER_NAME}:${USER_NAME}" "${HOME_DIR}/homebrew" || true
fi
sudo mkdir -p "${PLUGINS_DIR}" 2>/dev/null || mkdir -p "${PLUGINS_DIR}"
sudo chown -R "${USER_NAME}:${USER_NAME}" "${PLUGINS_DIR}" || true
chmod u+rwx "${PLUGINS_DIR}" || true

echo "==> [2/6] Removing old plugin folders..."
# Use sudo rm in case leftovers are root-owned.
sudo rm -rf \
  "${TARGET}" \
  "${PLUGINS_DIR}/physical-media-launcher" \
  "${PLUGINS_DIR}/physical-game-plugin-" \
  "${PLUGINS_DIR}/PhysicalMediaLauncher-" \
  /tmp/pml-get \
  /tmp/pml-install-deck \
  /tmp/pml-work-deck-* \
  /tmp/pml-hard-* \
  2>/dev/null || true

# Recreate work dir after cleanup.
WORK="/tmp/pml-hard-${USER_NAME}-$$"
mkdir -p "${WORK}"
cd /tmp

echo "==> [3/6] Downloading ${BRANCH} into ${WORK} ..."
git clone --branch "${BRANCH}" --single-branch "${REPO_URL}" "${WORK}/repo"

echo "==> [4/6] Installing into ${TARGET} ..."
mkdir -p "${PLUGINS_DIR}"
mkdir -p "${TARGET}"
cp -a "${WORK}/repo/." "${TARGET}/"
rm -rf "${TARGET}/.git" "${TARGET}/node_modules" "${TARGET}/tests" || true
sudo chown -R "${USER_NAME}:${USER_NAME}" "${TARGET}" || true
chmod -R u+rwX "${TARGET}" 2>/dev/null || true

echo "==> [5/6] Verifying install..."
if [[ ! -f "${TARGET}/main.py" ]]; then
  echo "ERROR: main.py missing at ${TARGET}"
  exit 1
fi
# Read build marker from the installed main.py so this script cannot drift.
BUILD_MARKER="$(
  grep -oE 'plugin_build["'\'']?\s*[:=]\s*["'\''][^"'\'']+["'\'']' "${TARGET}/main.py" \
    | head -1 \
    | grep -oE '"[^"]+"' \
    | tr -d '"' \
    || true
)"
if [[ -z "${BUILD_MARKER}" ]]; then
  BUILD_MARKER="$(
    grep -oE '1\.[0-9]+\.[0-9]+|2026-07-21-launch[0-9]+' "${TARGET}/main.py" | head -1 || true
  )"
fi
if [[ -z "${BUILD_MARKER}" ]]; then
  echo "ERROR: no plugin_build marker found in main.py"
  echo "---- main.py plugin_build lines ----"
  grep -n "plugin_build" "${TARGET}/main.py" || true
  exit 1
fi
if [[ ! -f "${TARGET}/dist/index.js" ]]; then
  echo "WARNING: dist/index.js missing"
fi
# Catch broken backends before Decky shows "unknown — please update".
if ! python3 -m py_compile "${TARGET}/main.py"; then
  echo "ERROR: main.py has a Python syntax error (plugin would not load)."
  exit 1
fi
python3 -m py_compile "${TARGET}/backend/"*.py
echo "OK: plugin_build marker ${BUILD_MARKER}"
echo "OK: $(grep -n 'plugin_build' "${TARGET}/main.py" | head -3)"

echo "==> [6/6] Restarting Decky loader..."
if systemctl list-unit-files 2>/dev/null | grep -q '^plugin_loader.service'; then
  sudo systemctl restart plugin_loader.service
elif systemctl --user list-unit-files 2>/dev/null | grep -q plugin_loader; then
  systemctl --user restart plugin_loader.service || true
else
  sudo systemctl restart plugin_loader.service 2>/dev/null || \
  sudo systemctl restart plugin_loader 2>/dev/null || \
  echo "NOTE: Could not restart plugin_loader automatically. Reboot the Deck."
fi

rm -rf "${WORK}" || true

echo
echo "======================================================"
echo " SUCCESS"
echo " Plugin path: ${TARGET}"
echo "======================================================"
echo "Next:"
echo "  1. Game Mode -> open Physical Media Launcher"
echo "  2. Plugin build must show: ${BUILD_MARKER}"
echo "  3. Start Transfer once"
echo "  4. Launch last game now"
echo "If build still says unknown: reboot the Steam Deck."
echo
