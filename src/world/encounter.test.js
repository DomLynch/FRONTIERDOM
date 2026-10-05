import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncounterView } from './encounter.js';
const projection=(tick,events,id='battle')=>({id,tick,status:'active',snapshot:{player:{id:'horizon',hull:100-tick},pirate:{id:'pirate',hull:100}},events,cursor:{to:events.at(-1)?.sequence+1||0}});
test('reload seeds actual current snapshot quietly; accepted new sequences play once',()=>{
 const view=createEncounterView(), e={sequence:3,tick:2,type:'damage'};
 const first=projection(2,[e]);assert.deepEqual(view.accept(first,'A').events,[]);
 const next=projection(3,[e,{sequence:4,tick:3,type:'weapon'}]);
 assert.equal(view.accept(next,'A').events.length,1);assert.equal(view.accept(next,'A').events.length,0);
 assert.equal(view.accept(first,'A').snapshot.tick,3);
});
test('company switch, cleared session and changed encounter cannot replay old combat',()=>{
 const view=createEncounterView(), p=projection(8,[{sequence:20,type:'boarding'}]);
 view.accept(p,'A');assert.equal(view.accept(p,'B').events.length,0);
 assert.equal(view.accept(null,null).snapshot,null);assert.equal(view.accept(p,'A').events.length,0);
 assert.equal(view.accept(projection(0,[{sequence:0,type:'approach'}],'new'),'A').events.length,0);
 assert.equal(view.accept(projection(1,[{sequence:1,type:'weapon'}],'new'),'A').events.length,1);
});
test('presentation consumes projections without mutating authoritative inputs',()=>{
 const view=createEncounterView();const p=projection(1,[{sequence:1,type:'hit'}]);const frozen=JSON.stringify(p);
 view.accept(p,'A');view.accept(projection(2,[{sequence:2,type:'damage'}]),'A');
 assert.equal(JSON.stringify(p),frozen);
});
