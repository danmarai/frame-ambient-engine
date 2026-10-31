import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
export const digest=b=>createHash('sha256').update(b).digest('hex');
export function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
export function sign(key,method,path,body,time,nonce){return createHmac('sha256',key).update([method,path,time,nonce,digest(body)].join('\n')).digest('hex');}
export function headers(key,method,path,body=''){const t=String(Date.now()),n=randomUUID();return {'x-frame-time':t,'x-frame-nonce':n,'x-frame-signature':sign(key,method,path,body,t,n)};}
export function verifier(key){const used=new Map();return (method,path,body,h)=>{
 const t=h['x-frame-time'],n=h['x-frame-nonce'],s=h['x-frame-signature'];
 const now=Date.now();for(const [id,expiry] of used)if(expiry<now)used.delete(id);
 if(typeof t!=='string'||!/^\d{13}$/.test(t)||Math.abs(now-Number(t))>60000||typeof n!=='string'||! /^[a-f0-9-]{36}$/.test(n)||typeof s!=='string'||used.has(n)||used.size>10000)return false;
 if(!equal(s,sign(key,method,path,body,t,n)))return false;
 used.set(n,now+120000);return true;
};}
