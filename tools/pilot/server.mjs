import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from '../../packages/rendering/node_modules/sharp/lib/index.js';
import {equal,verifier} from './auth.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const dir=process.env.FRAME_PILOT_DATA;
if(!dir)throw Error('FRAME_PILOT_DATA required');
const config=JSON.parse(await fs.readFile(path.join(dir,'config.json'),'utf8'));
if(typeof config.browserKey!=='string'||config.browserKey.length<40||typeof config.bridgeKey!=='string'||config.bridgeKey.length<40||config.origin!=='https://frame.marantz.net')throw Error('Invalid pilot security configuration');
const verify=verifier(config.bridgeKey), sessions=new Map();
const imageDir=path.join(dir,'images');await fs.mkdir(imageDir,{recursive:true,mode:0o700});
let bridgeSeen=0, job=null, lastResult=null, uploading=false;
let failures=0, reset=0;
async function body(req,limit){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('Payload too large');chunks.push(chunk);}return Buffer.concat(chunks);}
const idOK=id=>/^[a-f0-9-]{36}$/.test(id);
async function gallery(){return (await fs.readdir(imageDir)).filter(n=>/^[a-f0-9-]{36}\.jpg$/.test(n)).map(n=>({id:n.slice(0,-4)}));}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const send=(status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':type});res.end(type==='application/json'?JSON.stringify(value):value);};
 try {
  const p=req.url, method=req.method;
  if(!p||p.includes('?'))return send(404,{error:'Not found'});
  if(p==='/'&&method==='GET')return send(200,await fs.readFile(path.join(here,'index.html')),'text/html; charset=utf-8');
  if(['/ui.js','/style.css'].includes(p)&&method==='GET')return send(200,await fs.readFile(path.join(here,p.slice(1))),p.endsWith('.js')?'text/javascript':'text/css');
  if(p==='/login'&&method==='POST'){
   if(req.headers.origin!==config.origin)return send(403,{error:'Origin rejected'});
   if(Date.now()>reset){failures=0;reset=Date.now()+60000;}
   if(failures>=10)return send(429,{error:'Wait a minute before trying again'});
   const input=JSON.parse((await body(req,1024)).toString());
   if(!equal(input.key,config.browserKey)){failures++;return send(401,{error:'Invalid key'});}
   for(const [k,v]of sessions)if(v<Date.now())sessions.delete(k);
   if(sessions.size>=100)return send(429,{error:'Too many sessions'});
   const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);
   res.setHeader('Set-Cookie',`__Host-frame=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);return send(200,{ok:true});
  }
  if(p.startsWith('/bridge/')){
   const bytes=await body(req,16384);
   if(!verify(method,p,bytes,req.headers))return send(401,{error:'Bridge authentication required'});
   bridgeSeen=Date.now();
   if(p==='/bridge/poll'&&method==='POST'){
    if(job?.status==='pending'){job.status='running';return send(200,{job:{id:job.id,image:job.image}});}
    return send(200,{job:null});
   }
   if(p==='/bridge/result'&&method==='POST'){
    const result=JSON.parse(bytes.toString());
    if(!job||result.id!==job.id||job.status!=='running')return send(409,{error:'No matching running job'});
    lastResult={id:job.id,image:job.image,ok:result.ok===true,message:String(result.message||'').slice(0,500),at:new Date().toISOString()};
    await fs.writeFile(path.join(dir,'last-result.json'),JSON.stringify(lastResult),{mode:0o600});job=null;return send(200,{ok:true});
   }
   const id=p.slice('/bridge/image/'.length);
   if(p.startsWith('/bridge/image/')&&method==='GET'&&idOK(id)&&job?.image===id)return send(200,await fs.readFile(path.join(imageDir,id+'.jpg')),'image/jpeg');
   return send(404,{error:'Not found'});
  }
  const token=(req.headers.cookie||'').split('; ').find(v=>v.startsWith('__Host-frame='))?.slice(13);
  if(!token||!(sessions.get(token)>Date.now()))return send(401,{error:'Sign in with your access key'});
  if(method!=='GET'&&req.headers.origin!==config.origin)return send(403,{error:'Origin rejected'});
  if(p==='/logout'&&method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','__Host-frame=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');return send(200,{ok:true});}
  if(p==='/api/status'&&method==='GET'){
   if(job&&Date.now()-job.created>300000){lastResult={ok:false,message:'Bridge timed out. Check TV before retrying.'};job=null;}
   return send(200,{bridgeOnline:Date.now()-bridgeSeen<30000,job,lastResult,images:await gallery()});
  }
  if(p.startsWith('/image/')&&method==='GET'&&idOK(p.slice(7)))return send(200,await fs.readFile(path.join(imageDir,p.slice(7)+'.jpg')),'image/jpeg');
  if(p==='/api/upload'&&method==='POST'){
   if(uploading)return send(409,{error:'Another upload is processing'});
   if((await gallery()).length>=200)return send(409,{error:'Pilot gallery limit reached'});
   uploading=true;
   try{
    const input=await body(req,20*1024*1024);const img=sharp(input,{limitInputPixels:40000000});const meta=await img.metadata();
    if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw Error('Use a single JPEG, PNG or WebP');
    const id=randomUUID();await img.rotate().resize(3840,2160,{fit:'cover'}).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toFile(path.join(imageDir,id+'.jpg'));
    return send(201,{id,upscaled:meta.width<3840||meta.height<2160});
   }finally{uploading=false;}
  }
  if(p==='/api/display'&&method==='POST'){
   if(job)return send(409,{error:'A TV operation is already in progress'});
   if(Date.now()-bridgeSeen>30000)return send(409,{error:'The laptop TV bridge is offline'});
   const input=JSON.parse((await body(req,1024)).toString());
   if(!idOK(input.id)||(await gallery()).every(x=>x.id!==input.id))return send(400,{error:'Unknown image'});
   job={id:randomUUID(),image:input.id,status:'pending',created:Date.now()};return send(202,{ok:true});
  }
  send(404,{error:'Not found'});
 }catch(e){if(!res.headersSent)send(400,{error:e.code==='ENOENT'?'Not found':'Request could not be processed'});else res.end();}
});
server.requestTimeout=30000;server.headersTimeout=10000;
server.listen(3848,'127.0.0.1',()=>console.log('Frame pilot listening on loopback port 3848'));
