import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTransit} from './transit.js';
test('first/reloaded state never invents transit; confirmed change starts once',()=>{
 const t=createTransit(); assert.equal(t.accept('eden'),false); assert.equal(t.active,false);
 assert.equal(t.accept('earth'),true); assert.equal(t.active,true);
 assert.equal(t.advance(0.8),0.5); t.accept('earth'); assert.equal(t.advance(0),0.5);
 assert.equal(t.advance(5),0); assert.equal(t.active,false);
});
test('reduced motion/cancel do not replay on resumed same state; invalid state is rejected',()=>{
 const t=createTransit();t.accept('earth');t.accept('eden',true);assert.equal(t.active,false);
 t.accept('earth');assert.equal(t.active,true);t.cancel();t.accept('earth');assert.equal(t.active,false);
 assert.throws(()=>t.accept('forge'),/Expected earth or eden/);assert.equal(t.active,false);
});

test('company switch seeds directly; only same-company confirmed travel plays',()=>{
 const t=createTransit();t.accept('earth',false,'A');assert.equal(t.active,false);
 t.accept('eden',false,'B');assert.equal(t.active,false);
 t.accept('earth',false,'B');assert.equal(t.active,true);assert.equal(t.advance(0.8),0.5);
 t.accept('earth',false,'B');assert.equal(t.advance(0),0.5);
 t.accept('eden',true,'B');assert.equal(t.active,false);
});
