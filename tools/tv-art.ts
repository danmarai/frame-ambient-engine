/** LAN-side helper for artwork generated with the user's Codex subscription.
 * Run on a machine on the TV's network; builds remain on Tuscany.
 * pnpm --filter @frame/cloud exec tsx ../../tools/tv-art.ts status TV_IP
 * pnpm --filter @frame/cloud exec tsx ../../tools/tv-art.ts upload TV_IP /path/art.png
 * pnpm --filter @frame/cloud exec tsx ../../tools/tv-art.ts select TV_IP CONTENT_ID
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import WebSocket from '../apps/cloud/node_modules/ws/index.js';
import sharp from '../packages/rendering/node_modules/sharp/lib/index.js';
import { uploadToTv, selectAndActivate } from '../apps/cloud/src/tv-upload.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.frame-local');

async function main() {
  const [command, ip, input] = process.argv.slice(2);
  if (!['status','upload','select'].includes(command) || !ip ||
      !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ||
      ip.split('.').length !== 4 || ip.split('.').some(n => !/^\d+$/.test(n) || +n > 255)) {
    throw new Error('Usage: tv-art.ts status|upload|select PRIVATE_TV_IP [image path|content ID]');
  }
  await fs.mkdir(local,{recursive:true,mode:0o700});
  const tokenPath=path.join(local,`${ip}.token`);
  let token='';try { token=(await fs.readFile(tokenPath,'utf8')).trim(); } catch {}
  async function status(): Promise<Record<string,unknown>> {
    return new Promise((resolve,reject)=>{
      const state:Record<string,unknown>={};
      const ws=new WebSocket(`wss://${ip}:8002/api/v2/channels/com.samsung.art-app?name=${Buffer.from('FrameCloud').toString('base64')}&token=${encodeURIComponent(token)}`,{rejectUnauthorized:false});
      const timeout=setTimeout(()=>{ws.terminate();reject(new Error('TV probe timed out; check TV connection approval'));},15000);
      const finish=()=>{clearTimeout(timeout);ws.close();resolve(state)};
      ws.on('error',(e:Error)=>{clearTimeout(timeout);reject(e)});
      ws.on('message',async (raw:Buffer)=>{
        try {
          const message=JSON.parse(raw.toString());
          if(message.event==='ms.channel.connect') {
            if(message.data?.token){token=message.data.token;await fs.writeFile(tokenPath,token,{mode:0o600});}
            for(const request of ['get_artmode_status','get_current_artwork','get_api_version']) {
              ws.send(JSON.stringify({method:'ms.channel.emit',params:{event:'art_app_request',to:'host',data:JSON.stringify({request,id:randomUUID()})}}));
            }
          } else if(message.event==='d2d_service_message') {
            const data=typeof message.data==='string'?JSON.parse(message.data):message.data;
            if(data.event==='artmode_status') state.artMode=data.value;
            if(data.event==='current_artwork') state.contentId=data.content_id;
            if(data.event==='api_version') state.apiVersion=data.version;
            if(Object.keys(state).length===3)finish();
          }
        }catch(e){clearTimeout(timeout);ws.terminate();reject(e)}
      });
    });
  }
  const before=await status();
  if(command==='status'){console.log(JSON.stringify(before,null,2));return;}
  if(!input)throw new Error('An image path or content ID is required');
  let contentId=input;
  if(command==='upload'){
    const source=path.resolve(input);
    const meta=await sharp(source).metadata();
    if(!meta.width || !meta.height)throw new Error('Invalid image');
    const bytes=await sharp(source).rotate().resize(3840,2160,{fit:'cover'}).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
    const result=await uploadToTv(ip,bytes,token);
    if(!result.success || !result.contentId)throw new Error(result.error || 'TV upload failed; do not retry immediately');
    contentId=result.contentId;
    await fs.writeFile(path.join(local,`${Date.now()}-upload.json`),JSON.stringify({at:new Date().toISOString(),ip,source,sourceWidth:meta.width,sourceHeight:meta.height,upscaled:meta.width<3840 || meta.height<2160,before,...result},null,2));
  }
  if(!await selectAndActivate(ip,contentId,token))throw new Error('Selection command failed');
  const after=await status();
  if(after.contentId!==contentId || after.artMode!=='on')throw new Error(`TV readback did not confirm selection: ${JSON.stringify(after)}`);
  console.log(JSON.stringify({verified:true,previous:before,current:after},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
