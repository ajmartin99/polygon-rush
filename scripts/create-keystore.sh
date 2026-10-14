#!/usr/bin/env bash
# Creates an Android upload keystore and prints the values to paste into
# GitHub: Settings > Secrets and variables > Actions > New repository secret.
#
# Usage: ./scripts/create-keystore.sh [alias]
# Keep the generated .jks file and passwords somewhere safe (password manager).
# If you lose them you cannot publish updates with the same key.
set -euo pipefail

ALIAS="${1:-polygonrush}"
OUT="polygon-rush-upload.jks"

if [ -e "$OUT" ]; then
  echo "$OUT already exists - refusing to overwrite." >&2
  exit 1
fi

read -r -s -p "Choose a keystore password (min 6 chars): " PASS
echo
keytool -genkeypair -v \
  -keystore "$OUT" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" \
  -dname "CN=Polygon Rush, OU=Games, O=Polygon Rush, C=US"

echo
echo "Created $OUT. Add these GitHub repository secrets:"
echo "  ANDROID_KEYSTORE_BASE64   = (contents of $OUT.base64.txt)"
echo "  ANDROID_KEYSTORE_PASSWORD = the password you just typed"
echo "  ANDROID_KEY_ALIAS         = $ALIAS"
echo "  ANDROID_KEY_PASSWORD      = the password you just typed"
base64 -w0 "$OUT" > "$OUT.base64.txt" 2>/dev/null || base64 -i "$OUT" -o "$OUT.base64.txt"
echo
echo "Wrote $OUT.base64.txt (do NOT commit it; *.jks is already git-ignored, delete the .txt after copying)."
