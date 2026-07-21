#!/usr/bin/env bash
# Compatibility wrapper — always use the safe installer.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/safe-install-on-deck.sh"
