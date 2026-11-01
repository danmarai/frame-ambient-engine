import fs from 'node:fs/promises';
import path from 'node:path';
export const features=[
 {id:'review',name:'Artwork review',ready:true,description:'Approve, reject or leave images unreviewed. Decisions are saved on Tuscany.'},
 {id:'rotation',name:'Approved-art rotation',ready:true,description:'Cycle approved images at a chosen interval. Requires review. Enable this, then explicitly press Start.'},
 {id:'compare',name:'Side-by-side comparison',ready:false,description:'Queued: compare two candidates at equal scale and record a preference.'},
 {id:'crop',name:'TV crop and room preview',ready:false,description:'Queued: choose a focal point and preview the actual TV crop and matte.'},
 {id:'seasonal',name:'Seasonal collections',ready:false,description:'Queued: curated seasonal playlists, quiet hours and a review gate before publishing.'},
 {id:'variations',name:'Targeted variations',ready:false,description:'Queued: carry review notes into versioned Codex requests and compare revisions.'},
 {id:'androidBridge',name:'Android phone bridge',ready:false,description:'Deferred: replace the laptop helper with a paired outbound-only phone bridge.'}
];
export async function createLabs(dir){
 const file=path.join(dir,'labs.json');let state={flags:{review:false,rotation:false},reviews:{},rotation:{active:false,minutes:15,lastImage:null,nextAt:null,message:'Stopped'}};
 try{const saved=JSON.parse(await fs.readFile(file,'utf8'));state={...state,...saved};}catch(e){if(e.code!=='ENOENT')throw e;}
 // Restart never resumes physical-device changes without an explicit Start.
 state.rotation={...state.rotation,active:false,nextAt:null,message:'Stopped; press Start to rotate approved art'};
 let queue=Promise.resolve();
 const clone=()=>JSON.parse(JSON.stringify({...state,features}));
 const persist=async()=>{await fs.writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});await fs.rename(file+'.tmp',file);};
 const mutate=fn=>{const p=queue.then(async()=>{fn();await persist();return clone();});queue=p.catch(()=>{});return p;};
 const stop=message=>{state.rotation.active=false;state.rotation.nextAt=null;state.rotation.message=message;};
 await persist();
 return {
  snapshot:clone,
  flag:(id,enabled)=>mutate(()=>{const f=features.find(x=>x.id===id);if(!f?.ready||typeof enabled!=='boolean')throw Error('Feature is not available');if(id==='rotation'&&enabled&&!state.flags.review)throw Error('Enable artwork review first');state.flags[id]=enabled;if(!enabled){stop('Stopped by feature flag');if(id==='review')state.flags.rotation=false;}}),
  review:(id,value,ids)=>mutate(()=>{if(!state.flags.review)throw Error('Artwork review is disabled');if(!ids.includes(id)||!['approved','rejected','unreviewed'].includes(value))throw Error('Invalid review');state.reviews[id]=value;}),
  control:(action,minutes,ids,online)=>mutate(()=>{
   if(action==='stop'){stop('Stopped');return;}
   if(!state.flags.review||!state.flags.rotation)throw Error('Enable review and rotation in Labs first');
   if(action!=='start'||!Number.isInteger(minutes)||minutes<5||minutes>1440)throw Error('Choose an interval from 5 to 1440 minutes');
   if(!online)throw Error('TV bridge is offline');
   if(!ids.some(id=>state.reviews[id]==='approved'))throw Error('Approve at least one artwork first');
   state.rotation={...state.rotation,active:true,minutes,nextAt:Date.now(),message:'Ready for next approved artwork'};
  }),
  candidate:(ids,now=Date.now())=>{if(!state.flags.review||!state.flags.rotation||!state.rotation.active||now<state.rotation.nextAt)return null;const approved=ids.filter(id=>state.reviews[id]==='approved').sort();if(!approved.length)return null;const i=approved.indexOf(state.rotation.lastImage);return approved[(i+1)%approved.length];},
  queued:()=>mutate(()=>{state.rotation.message='Waiting for TV confirmation';}),
  complete:(id,ok)=>mutate(()=>{if(!ok){stop('Paused after TV failure; check TV before restarting');return;}state.rotation.lastImage=id;state.rotation.nextAt=state.rotation.active?Date.now()+state.rotation.minutes*60000:null;state.rotation.message=state.rotation.active?'Waiting for next interval':'Stopped';}),
  pause:message=>mutate(()=>stop(message))
 };
}
