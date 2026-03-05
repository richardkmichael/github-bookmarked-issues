#!/usr/bin/env bash
# Upload a zip to Chrome Web Store without submitting for review.
#
# Use this when the publish-browser-extension tool fails due to a pending
# review (ITEM_NOT_UPDATABLE). Cancel the pending review in the Dashboard
# first, then run this script.
#
# Requires .env.submit with CHROME_CLIENT_ID, CHROME_CLIENT_SECRET,
# CHROME_REFRESH_TOKEN, and CHROME_EXTENSION_ID.
#
# Usage: scripts/cws-upload.sh path/to/extension.zip

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-zip>" >&2
  exit 1
fi

ZIP_PATH="$1"

if [ ! -f "$ZIP_PATH" ]; then
  echo "Error: file not found: $ZIP_PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# shellcheck source=/dev/null
source "$PROJECT_DIR/.env.submit"

TOKEN=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=$CHROME_CLIENT_ID&client_secret=$CHROME_CLIENT_SECRET&refresh_token=$CHROME_REFRESH_TOKEN&grant_type=refresh_token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Uploading $ZIP_PATH ..."

RESPONSE=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-api-version: 2" \
  -T "$ZIP_PATH" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/$CHROME_EXTENSION_ID")

echo "$RESPONSE" | python3 -m json.tool

UPLOAD_STATE=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uploadState','UNKNOWN'))")

if [ "$UPLOAD_STATE" = "SUCCESS" ]; then
  echo "Upload succeeded. Submit for review with: scripts/cws-submit.sh"
else
  echo "Upload failed: $UPLOAD_STATE" >&2
  exit 1
fi
