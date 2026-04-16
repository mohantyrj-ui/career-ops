#!/usr/bin/env bash
set -euo pipefail

CAREER_OPS_DIR="/Users/ranjanmohanty/Documents/career-ops"
LOG_FILE="$HOME/Library/Logs/career-ops-scan.log"

# Ensure log directory exists
mkdir -p "$HOME/Library/Logs"

# Redirect all output (this script + child processes) to log file
exec >> "$LOG_FILE" 2>&1

echo ""
echo "============================================"
echo "career-ops morning scan — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "============================================"

# Load .env explicitly — LaunchAgents don't run direnv
if [ -f "$CAREER_OPS_DIR/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$CAREER_OPS_DIR/.env"
  set +a
else
  echo "Error: .env not found at $CAREER_OPS_DIR/.env"
  exit 1
fi

cd "$CAREER_OPS_DIR"

# Use absolute path to node — LaunchAgent PATH is minimal
/usr/local/bin/node morning-scan.mjs

echo "--- done $(date '+%H:%M:%S') ---"
