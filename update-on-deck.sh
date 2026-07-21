#!/usr/bin/env bash
# Wrapper kept for compatibility — always runs the safe installer path.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/safe-install-on-deck.sh"
