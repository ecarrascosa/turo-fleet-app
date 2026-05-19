#!/bin/bash
# VPS Setup Script for Turo Guest Link Bot
# Run as root on a fresh Ubuntu 22.04+ server

set -e

echo "=== Turo Guest Link Bot - VPS Setup ==="

# 1. System updates
apt-get update && apt-get upgrade -y

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. Install Chrome dependencies + Chrome
apt-get install -y \
  wget curl unzip \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 libxshmfence1 fonts-liberation

# Chrome install (stable)
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
dpkg -i google-chrome-stable_current_amd64.deb || apt-get -f install -y
rm google-chrome-stable_current_amd64.deb

# 4. Create deploy user
if ! id deploy &>/dev/null; then
  useradd -m -s /bin/bash deploy
fi

# 5. Set up app directory
APP_DIR=/home/deploy/turo-bot
mkdir -p $APP_DIR
cp send-guest-links.js $APP_DIR/
cd $APP_DIR

# 6. Install Node dependencies
cat > package.json <<'EOF'
{
  "name": "turo-guest-link-bot",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "puppeteer": "^22.0.0",
    "@neondatabase/serverless": "^0.10.0"
  }
}
EOF
npm install

# 7. Create .env file (fill in your values!)
cat > .env <<'EOF'
DATABASE_URL=postgresql://neondb_owner:npg_A6CmwQfrtyL2@ep-ancient-mode-ak3oye5i-pooler.c-3.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require
TURO_EMAIL=your-turo-email@example.com
TURO_PASSWORD=your-turo-password
SLACK_WEBHOOK=
EOF

# 8. Create run script that loads .env
cat > run.sh <<'SCRIPT'
#!/bin/bash
set -a
source /home/deploy/turo-bot/.env
set +a
cd /home/deploy/turo-bot
/usr/bin/node send-guest-links.js >> /home/deploy/turo-bot/bot.log 2>&1
SCRIPT
chmod +x run.sh

# 9. Set up cron (every 15 min)
CRON_LINE="*/15 * * * * /home/deploy/turo-bot/run.sh"
(crontab -u deploy -l 2>/dev/null; echo "$CRON_LINE") | sort -u | crontab -u deploy -

# 10. Set ownership
chown -R deploy:deploy $APP_DIR

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit /home/deploy/turo-bot/.env with your Turo credentials"
echo "2. Test manually: sudo -u deploy /home/deploy/turo-bot/run.sh"
echo "3. Check logs: tail -f /home/deploy/turo-bot/bot.log"
echo "4. Cron is running every 15 minutes"
echo ""
