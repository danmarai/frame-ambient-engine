import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStudio} from './studio.mjs';
const draft={title:'October river',category:'River & lake',season:'Autumn',light:'Soft overcast',location:'Pacific Northwest',notes:'Quiet water',prompt:'A restrained photograph of a river.'};
async function setup(t,extra={}){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'frame-studio-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const deps={saveImage:async()=>({id:'image-1',upscaled:false}),...extra};return {dir,deps,studio:await createStudio(dir,deps)};}
test('drafts persist, stale edits are rejected, and imports preserve prompt versions',async t=>{const {studio,dir,deps}=await setup(t);const d=await studio.save(draft);const revised=await studio.save({...d,prompt:'Changed prompt'});await assert.rejects(studio.save({...d,prompt:'Stale'}),/another window/);await studio.import(d.id,Buffer.from('image'));await studio.save({...revised,prompt:'Next version'});const loaded=await createStudio(dir,deps);assert.equal(loaded.snapshot().drafts[0].prompt,'Next version');assert.equal(loaded.snapshot().artworks['image-1'].prompt,'Changed prompt');});
test('invalid drafts are rejected without persisting',async t=>{const {studio}=await setup(t);await assert.rejects(studio.save({...draft,category:'Unknown'}));await assert.rejects(studio.save({...draft,prompt:'x'.repeat(8001)}));assert.equal(studio.snapshot().drafts.length,0);});
test('prepared requests freeze the exact prompt and imports attach to that version',async t=>{const {studio}=await setup(t);const d=await studio.save(draft);const request=await studio.prepare(d.id);await studio.save({...d,prompt:'Later edit'});await studio.import(d.id,Buffer.from('image'),request.id);assert.equal(studio.snapshot().artworks['image-1'].prompt,draft.prompt);assert.equal(studio.snapshot().requests[0].status,'imported');await assert.rejects(studio.import(d.id,Buffer.from('image'),'unknown'),/not found/);});
