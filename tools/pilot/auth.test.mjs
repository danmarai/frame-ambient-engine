import test from 'node:test';import assert from 'node:assert/strict';
import {headers,verifier,sign} from './auth.mjs';
const key='test-only-secret'.repeat(4);
test('signed request accepted once; replay and body tampering rejected',()=>{const verify=verifier(key),h=headers(key,'POST','/bridge/poll','{}');assert.equal(verify('POST','/bridge/poll','{}',h),true);assert.equal(verify('POST','/bridge/poll','{}',h),false);assert.equal(verifier(key)('POST','/bridge/poll','different',h),false);assert.equal(verifier(key)('GET','/bridge/poll','{}',h),false);assert.equal(verifier(key)('POST','/bridge/result','{}',h),false);});
test('expired and missing credentials rejected',()=>{const t=String(Date.now()-120000),n='12345678-1234-1234-1234-123456789abc';assert.equal(verifier(key)('POST','/bridge/poll','',{'x-frame-time':t,'x-frame-nonce':n,'x-frame-signature':sign(key,'POST','/bridge/poll','',t,n)}),false);assert.equal(verifier(key)('POST','/bridge/poll','',{}),false);});
