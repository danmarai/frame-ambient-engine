import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const categories = ['River & lake','Forest','Coast','Mountains','Meadow','Wetlands','Desert'];
export const seasons = ['Spring','Summer','Autumn','Winter'];
export const lights = ['Soft overcast','Morning light','Late afternoon','After rain'];
export function validateDraft(input) {
  const text=(key,max,required=false)=>{
    const value=input[key]??'';
    if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error(`Invalid ${key}`);
    return value.trim();
  };
  const d={title:text('title',120,true),category:text('category',50,true),season:text('season',30,true),light:text('light',40,true),location:text('location',200),notes:text('notes',1500),prompt:text('prompt',8000,true)};
  if(!categories.includes(d.category)||!seasons.includes(d.season)||!lights.includes(d.light))throw Error('Choose a supported category, season and light');
  return d;
}

/** Persistent personal studio. Writes are serialized; generation remains in Codex. */
export async function createStudio(dir, {saveImage}) {
  const file=path.join(dir,'studio.json');
  let state={drafts:[],artworks:{},requests:[]};
  try{state=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  let queue=Promise.resolve();
  async function persist(){const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(state),{mode:0o600});await fs.rename(temp,file);}
  const mutate=fn=>{const p=queue.then(async()=>{const result=await fn();await persist();return result;});queue=p.catch(()=>{});return p;};
  await persist();
  const getDraft=id=>{const d=state.drafts.find(x=>x.id===id);if(!d)throw Error('Draft not found');return d;};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const snapshot=()=>clone({drafts:state.drafts,artworks:state.artworks,requests:state.requests,categories,seasons,lights});
  let inFlight=false;
  return {
    snapshot,
    async save(input){
      const fields=validateDraft(input);
      return mutate(()=>{
        if(input.id){const old=getDraft(input.id);if(input.version!==old.version)throw Error('Draft changed in another window. Reload it before saving.');Object.assign(old,fields,{version:old.version+1,updatedAt:new Date().toISOString()});return clone(old);}
        if(state.drafts.length>=100)throw Error('The studio supports up to 100 drafts');
        const draft={...fields,id:randomUUID(),version:1,updatedAt:new Date().toISOString()};state.drafts.unshift(draft);return clone(draft);
      });
    },
    async import(id,bytes,requestId){
      if(inFlight)throw Error('Another image is being prepared');
      const request=requestId?state.requests.find(x=>x.id===requestId&&x.draftId===id):null;
      if(requestId&&!request)throw Error('Prepared request not found');
      const draft=clone(request?request.draft:getDraft(id));inFlight=true;
      try{const image=await saveImage(bytes);await mutate(()=>{state.artworks[image.id]={...draft,id:image.id,draftId:draft.id,source:'Imported artwork',createdAt:new Date().toISOString(),...image};if(request){request.status='imported';request.imageId=image.id;}});return image;}finally{inFlight=false;}
    },
    async prepare(id){
      const draft=clone(getDraft(id));
      return mutate(()=>{
        if(state.requests.length>=200)throw Error('Prepared request limit reached');
        const request={id:randomUUID(),draftId:id,draft,status:'prepared',createdAt:new Date().toISOString()};
        state.requests.unshift(request);return clone(request);
      });
    }
  };
}
