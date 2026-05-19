#!/bin/bash
# Export Turo cookies from Chrome and upload to VPS
# Run this on your Mac when cookies expire

set -e

VPS_HOST="root@159.65.66.8"
VPS_KEY="$HOME/.ssh/openclaw_nopass"
COOKIES_FILE="/home/deploy/turo-bot/turo-cookies.json"

echo "=== Turo Cookie Exporter ==="
echo ""
echo "1. Open Chrome → turo.com (make sure you're logged in)"
echo "2. Open DevTools (Cmd+Option+I) → Console tab"
echo "3. Paste this and press Enter:"
echo ""
echo '   document.cookie.split("; ").reduce((o, c) => { const [k,...v] = c.split("="); o[k] = v.join("="); return o; }, {})'
echo ""
echo "4. Right-click the output → Copy Object"
echo "5. Paste it here and press Ctrl+D when done:"
echo ""

# Read pasted JSON from stdin
COOKIES=$(cat)

if [ -z "$COOKIES" ]; then
  echo "❌ No cookies provided"
  exit 1
fi

# Validate it's JSON
echo "$COOKIES" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null
if [ $? -ne 0 ]; then
  echo "❌ Invalid JSON"
  exit 1
fi

# Upload to VPS
echo "$COOKIES" | ssh -i "$VPS_KEY" "$VPS_HOST" "cat > $COOKIES_FILE && chown deploy:deploy $COOKIES_FILE && chmod 600 $COOKIES_FILE"

echo "✅ Cookies uploaded to VPS"
echo ""
echo "Testing..."
ssh -i "$VPS_KEY" "$VPS_HOST" "sudo -u deploy bash -c 'cd /home/deploy/turo-bot && export \$(grep -v \"^#\" .env | xargs) && node -e \"
const fs = require(\\\"fs\\\");
const c = JSON.parse(fs.readFileSync(\\\"turo-cookies.json\\\"));
const keys = Object.keys(c);
console.log(\\\"Cookies loaded:\\\", keys.length);
console.log(\\\"Has access_token:\\\", \\\"access_token\\\" in c);
console.log(\\\"Has refresh_token:\\\", \\\"refresh_token\\\" in c);
\"'"
