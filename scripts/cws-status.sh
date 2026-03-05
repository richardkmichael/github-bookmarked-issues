#!/usr/bin/env bash
# Check Chrome Web Store submission status via the v2 API.
#
# Requires .env.submit with CHROME_CLIENT_ID, CHROME_CLIENT_SECRET,
# CHROME_REFRESH_TOKEN, and CHROME_EXTENSION_ID.
#
# Usage: scripts/cws-status.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# shellcheck source=/dev/null
source "$PROJECT_DIR/.env.submit"

PUBLISHER_ID="c4788956-5ef1-486f-abc2-4acc9ea32cb2"

TOKEN=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=$CHROME_CLIENT_ID&client_secret=$CHROME_CLIENT_SECRET&refresh_token=$CHROME_REFRESH_TOKEN&grant_type=refresh_token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://chromewebstore.googleapis.com/v2/publishers/$PUBLISHER_ID/items/$CHROME_EXTENSION_ID:fetchStatus" \
  | python3 -m json.tool
