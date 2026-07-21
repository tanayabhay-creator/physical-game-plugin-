#!/usr/bin/env bash
# Optional udev helper for Physical Media Launcher.
# Writes a trigger stamp that can be used for diagnostics / external hooks.
set -euo pipefail

EVENT="${1:-unknown}"
DEV="${2:-}"
STAMP_DIR="${DECKY_PLUGIN_RUNTIME_DIR:-/tmp/physical-media-launcher}"
mkdir -p "${STAMP_DIR}"
printf '%s\t%s\t%s\n' "$(date -Is)" "${EVENT}" "${DEV}" >> "${STAMP_DIR}/media-events.log"
touch "${STAMP_DIR}/media-changed"
