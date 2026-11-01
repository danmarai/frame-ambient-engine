import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLabs} from './labs.mjs';
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'frame-labs-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {dir,labs:await createLabs(dir)};}
test('flags default off, queued features cannot enable, review persists and gates rotation',async t=>{
 const {dir,labs}=await setup(t);assert.deepEqual(labs.snapshot().flags,{review:false,rotation:false});
 await assert.rejects(labs.flag('androidBridge',true));await assert.rejects(labs.review('a','approved',['a']));await assert.rejects(labs.flag('rotation',true));
 await labs.flag('review',true);await labs.flag('rotation',true);
 await assert.rejects(labs.control('start',15,['a'],true));await assert.rejects(labs.review('missing','approved',['a']));
 await labs.review('a','approved',['a','b']);await labs.review('b','rejected',['a','b']);
 await assert.rejects(labs.control('start',1,['a'],true));await assert.rejects(labs.control('start',15,['a'],false));
 await labs.control('start',15,['a','b'],true);assert.equal(labs.candidate(['a','b']), 'a');
 await labs.complete('a',true);assert.equal(labs.candidate(['a','b']),null);
 const restarted=await createLabs(dir);assert.equal(restarted.snapshot().reviews.a,'approved');assert.equal(restarted.snapshot().rotation.active,false);
});
test('rotation selects only approved art, advances on success, stops on failure and flag disable',async t=>{
 const {labs}=await setup(t);await labs.flag('review',true);await labs.flag('rotation',true);
 for(const id of ['a','b'])await labs.review(id,'approved',['a','b','c']);
 await labs.control('start',5,['a','b','c'],true);assert.equal(labs.candidate(['c','b','a']),'a');
 await labs.complete('a',true);assert.equal(labs.candidate(['a','b','c'],Date.now()+300001),'b');
 await labs.review('b','rejected',['a','b','c']);assert.equal(labs.candidate(['a','b','c'],Date.now()+300001),'a');
 await labs.complete('a',false);assert.equal(labs.snapshot().rotation.active,false);
 await labs.control('start',5,['a'],true);await labs.flag('review',false);assert.equal(labs.snapshot().flags.rotation,false);assert.equal(labs.candidate(['a'],Infinity),null);
});
