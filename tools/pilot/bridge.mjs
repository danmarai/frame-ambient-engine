import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {headers} from './auth.mjs';
const run=promisify(execFile),here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
process.env.NODE_ENV='production';process.env.LOG_LEVEL='silent';
const dir=process.env.FRAME_BRIDGE_DATA;if(!dir)throw Error('FRAME_BRIDGE_DATA required');
const config=JSON.parse(await fs.readFile(path.join(dir,'config.json'),'utf8'));
if(config.origin!=='https://frame.marantz.net'||typeof config.bridgeKey!=='string'||config.bridgeKey.length<40)throw Error('Invalid bridge configuration');
const tvArgs=['--import',path.join(root,'apps/cloud/node_modules/tsx/dist/loader.mjs'),path.join(root,'tools/tv-art.ts')];
const statePath=path.join(dir,'state.json');let state={};try{state=JSON.parse(await fs.readFile(statePath,'utf8'));}catch{}
async function save(){await fs.writeFile(statePath,JSON.stringify(state),{mode:0o600});}
async function request(p,method='POST',value={}){const body=method==='GET'?'':JSON.stringify(value);const r=await fetch(config.origin+p,{method,headers:{...headers(config.bridgeKey,method,p,body),'Content-Type':'application/json'},body:method==='GET'?undefined:body,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok){const error=Error('Bridge request failed: '+r.status);error.status=r.status;throw error;}return r;}
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});
console.log('Frame TV bridge started (outbound connections only)');
while(!stopping){try{
 if(state.pending){try{await request('/bridge/result','POST',state.pending);}catch(e){if(e.status!==409)throw e;}delete state.pending;await save();}
 const {job}=await (await request('/bridge/poll')).json();
 if(job){
  if(!/^[a-f0-9-]{36}$/.test(job.id)||!/^[a-f0-9-]{36}$/.test(job.image))throw Error('Invalid job');
  let result={id:job.id,ok:false,message:'Operation interrupted; check TV before retrying.'};
  // Record before touching the TV; a crash must never cause an automatic upload retry.
  state.pending=result;await save();
  try{
   const cached=state[job.image];let output;
   if(cached)output=await run(process.execPath,[...tvArgs,'select',config.tvIp,cached],{cwd:root,timeout:90000,maxBuffer:65536});
   else {
    const response=await request('/bridge/image/'+job.image,'GET');
    const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>20*1024*1024)throw Error('Image too large');
    const file=path.join(dir,'current.jpg');await fs.writeFile(file,bytes,{mode:0o600});
    output=await run(process.execPath,[...tvArgs,'upload',config.tvIp,file],{cwd:root,timeout:180000,maxBuffer:65536});
   }
   const verified=JSON.parse(output.stdout);if(!verified.verified)throw Error('TV verification failed');
   state[job.image]=verified.current.contentId;result={id:job.id,ok:true,message:'Artwork verified on TV'};
  }catch(e){console.error('TV helper failure:',String(e.stderr||e.message).slice(0,1000));result={id:job.id,ok:false,message:'TV operation failed. Check the TV and its connection approval before retrying.'};}
  state.pending=result;await save();await request('/bridge/result','POST',result);delete state.pending;await save();
 }
}catch(e){console.error(new Date().toISOString(),e.message);}
 await new Promise(r=>setTimeout(r,5000));
}
