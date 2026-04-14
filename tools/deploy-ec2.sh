#!/bin/bash
# Deploy Frame Art cloud server to EC2
# Usage: ./tools/deploy-ec2.sh

EC2_HOST="ubuntu@ec2-3-84-52-62.compute-1.amazonaws.com"
EC2_KEY="/tmp/ec2-key.pem"
REMOTE_DIR="/home/ubuntu/frame-art"

echo "=== Deploying to EC2 ==="

# Step 1: Push local changes to git
echo "Pushing to git..."
cd "$(dirname "$0")/.."
git add -A
git commit -m "deploy: update cloud server" --allow-empty 2>/dev/null
git push origin main 2>&1 | tail -3

# Step 2: Pull on EC2
echo "Pulling on EC2..."
ssh -i "$EC2_KEY" -o StrictHostKeyChecking=no "$EC2_HOST" "
  cd $REMOTE_DIR
  git pull origin main 2>&1 | tail -5
  export PATH=\$PATH:/home/ubuntu/.npm-global/bin
  pnpm install 2>&1 | tail -3
  pm2 restart frame-art-cloud
  sleep 2
  pm2 status
  curl -s http://localhost:3847/api/ping
"

echo ""
echo "=== Deploy complete ==="
echo "Server: https://frameapp.dmarantz.com"
echo "Direct: http://frameapp.dmarantz.com:3847"
