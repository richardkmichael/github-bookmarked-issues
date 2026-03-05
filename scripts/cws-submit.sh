#!/usr/bin/env bash
# Submit the current Chrome Web Store draft for review.
#
# Run after cws-upload.sh, or after verifying the draft in the Dashboard.
#
# Requires .env.submit with CHROME_CLIENT_ID, CHROME_CLIENT_SECRET,
# CHROME_REFRESH_TOKEN, and CHROME_EXTENSION_ID.
#
# Usage: scripts/cws-submit.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# shellcheck source=/dev/null
source "$PROJECT_DIR/.env.submit"

TOKEN=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=$CHROME_CLIENT_ID&client_secret=$CHROME_CLIENT_SECRET&refresh_token=$CHROME_REFRESH_TOKEN&grant_type=refresh_token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Submitting for review ..."

curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" \
  "https://www.googleapis.com/chromewebstore/v1.1/items/$CHROME_EXTENSION_ID/publish" \
  | python3 -m json.tool
