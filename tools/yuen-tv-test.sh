#!/bin/bash
# Yuen's TV Test Runner — run this from the Mac
# Usage: ./tools/yuen-tv-test.sh <TV_IP>

TV_IP="${1:-10.199.1.210}"
SDB=~/tizen-studio/tools/sdb
TIZEN=~/tizen-studio/tools/ide/bin/tizen
export PATH=$PATH:~/tizen-studio/tools:~/tizen-studio/tools/ide/bin

echo "=== Yuen's TV Test Suite ==="
echo "TV IP: $TV_IP"
echo ""

# Step 1: REST API check
echo "--- Step 1: REST API ---"
TV_INFO=$(curl -s -k --connect-timeout 5 "http://$TV_IP:8001/api/v2/" 2>/dev/null)
if [ -z "$TV_INFO" ]; then
  echo "FAIL: TV not reachable at $TV_IP:8001"
  exit 1
fi
echo "$TV_INFO" | python3 -c "
import sys, json
d = json.load(sys.stdin)['device']
print(f\"Model: {d.get('modelName', '?')}\")
print(f\"Code: {d.get('model', '?')}\")
print(f\"Frame TV: {d.get('FrameTVSupport', '?')}\")
print(f\"Power: {d.get('PowerState', '?')}\")
print(f\"Dev Mode: {d.get('developerMode', '?')}\")
print(f\"Dev IP: {d.get('developerIP', '?')}\")
"

# Step 2: SDB connection
echo ""
echo "--- Step 2: SDB Connect ---"
$SDB connect $TV_IP
sleep 2
$SDB devices
CAPABILITY=$($SDB -s $TV_IP:26101 capability 2>/dev/null)
echo "$CAPABILITY" | grep -E "platform_version|profile_name|can_launch"

# Step 3: Deploy and run test app
echo ""
echo "--- Step 3: Deploy Test App ---"
cd "$(dirname "$0")/../apps/tizen-test"

# Use yuen-test.html as content
cp yuen-test.html index.html.bak 2>/dev/null
cp yuen-test.html index.html

# Ensure minimal config
cat > config.xml << 'XMLEOF'
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://frame-ambient.com/test" version="1.0.0" viewmodes="maximized">
    <tizen:application id="FrmeTst001.FrameTest" package="FrmeTst001" required_version="2.3"/>
    <tizen:profile name="tv"/>
    <content src="index.html"/>
    <icon src="icon.png"/>
    <name>Frame Test</name>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <access origin="*" subdomains="true"/>
</widget>
XMLEOF

rm -f "Frame Test.wgt" FrameTest.wgt signature1.xml author-signature.xml .manifest.tmp
tizen package -t wgt -s TV-test-1 -- .
mv "Frame Test.wgt" FrameTest.wgt 2>/dev/null

tizen uninstall -p FrmeTst001.FrameTest -s $TV_IP:26101 2>/dev/null
tizen install -n FrameTest.wgt -s $TV_IP:26101 -- .
tizen run -p FrmeTst001.FrameTest -s $TV_IP:26101

echo ""
echo "--- Test app running! Watch the TV for ~35 seconds ---"
echo "Results will appear on the TV screen."
echo ""
echo "--- Step 4: Mac-side Upload Test (after 40s) ---"
sleep 40

# Test upload from Mac
cd /tmp/tv-test
echo "Testing upload from Mac..."
node -e "
const WebSocket = require('ws');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const imageData = fs.readFileSync('/tmp/tv-test/claude-pikachu.jpg');
const reqId = crypto.randomUUID();
const ws = new WebSocket('wss://$TV_IP:8002/api/v2/channels/com.samsung.art-app?name='+Buffer.from('YuenMacTest').toString('base64'), {rejectUnauthorized:false});
ws.on('message', d => {
  const msg = JSON.parse(Buffer.isBuffer(d)?d.toString():d);
  if (msg.event === 'ms.channel.ready') {
    ws.send(JSON.stringify({method:'ms.channel.emit',params:{event:'art_app_request',to:'host',data:JSON.stringify({request:'send_image',file_type:'jpg',request_id:reqId,id:reqId,conn_info:{d2d_mode:'socket',connection_id:Math.floor(Math.random()*4294967296),id:reqId},image_date:'2026:04:13 18:00:00',matte_id:'none',portrait_matte_id:'shadowbox_polar',file_size:imageData.length})}}));
  }
  if (msg.event === 'd2d_service_message') {
    const inner = JSON.parse(msg.data);
    if (inner.event === 'ready_to_use') {
      const ci = JSON.parse(inner.conn_info);
      const header = JSON.stringify({num:0,total:1,fileLength:imageData.length,fileName:'pokemon.jpg',fileType:'jpg',secKey:ci.key,version:'0.0.1'});
      const sock = new net.Socket();
      sock.connect(parseInt(ci.port), ci.ip, () => {
        const hb = Buffer.from(header,'ascii'); const lb = Buffer.alloc(4); lb.writeUInt32BE(hb.length,0);
        sock.write(lb); sock.write(hb); sock.write(imageData);
      });
    }
    if (inner.event === 'image_added') {
      console.log('UPLOAD SUCCESS:', inner.content_id);
      // Select and show
      setTimeout(() => {
        ws.send(JSON.stringify({method:'ms.channel.emit',params:{event:'art_app_request',to:'host',data:JSON.stringify({request:'select_image',content_id:inner.content_id,id:'sel'})}}));
        ws.send(JSON.stringify({method:'ms.channel.emit',params:{event:'art_app_request',to:'host',data:JSON.stringify({request:'set_artmode_status',value:'on',id:'art'})}}));
      }, 1000);
      setTimeout(() => { ws.close(); }, 3000);
    }
    if (inner.event === 'error') { console.log('UPLOAD FAILED:', inner.error_code); ws.close(); }
  }
});
ws.on('close', () => process.exit(0));
setTimeout(() => { console.log('TIMEOUT'); ws.close(); process.exit(0); }, 25000);
"

echo ""
echo "=== DONE — Check TV for Pokemon art! ==="
