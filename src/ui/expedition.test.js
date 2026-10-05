import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedEncounter, expeditionObjective, dropIntent, advanceIntent, quoteConsequences, battleControls } from './expedition.js';

const state=()=>({companyId:'A',expedition:{enrolled:true,pendingJourney:{encounterId:'opening-A',demands:{dropUnits:2}}}});
const encounter=()=>({id:'opening-A',version:1,status:'active',choice:'fight',tick:5,snapshot:{player:{hull:88,maxHull:100,ammo:55},pirate:{hull:92,maxHull:100},posture:'balanced',commandCount:3},events:[{sequence:0,tick:2,type:'weapon'}],cursor:{from:0,to:1,total:1,next:null},result:null});

test('A-only snapshots retain A guidance; pending expedition cannot become a trade action',()=>{
  assert.equal(expeditionObjective({companyId:'legacy'},null),null);
  assert.equal(expeditionObjective(state(),encounter()).id,'battle');
  assert.equal(expeditionObjective(state(),encounter()).action,undefined);
});
test('drop chooses exact distinct held intent quantities without mutating the snapshot',()=>{
  const s=state(),before=structuredClone(s);
  assert.deepEqual(dropIntent(s.expedition.pendingJourney,{medicine:1,aurelia:1,food:0}),{type:'encounter_choice',encounterId:'opening-A',choice:'drop',cargoSelection:[{commodityId:'medicine',quantity:1},{commodityId:'aurelia',quantity:1}]});
  assert.throws(()=>dropIntent(s.expedition.pendingJourney,{medicine:1}),/exactly 2/);
  assert.throws(()=>dropIntent(s.expedition.pendingJourney,{medicine:1.5,aurelia:.5}),/exactly 2/);
  assert.deepEqual(s,before);
});
test('advances submit only encounter/ticks/intent, no client tick, seed or outcome',()=>{
  const e=encounter();
  for(const ticks of [1,2,5,180])assert.deepEqual(advanceIntent(e,ticks),{type:'battle_advance',encounterId:'opening-A',ticks});
  assert.deepEqual(advanceIntent(e,1,{type:'retreat'}),{type:'battle_advance',encounterId:'opening-A',ticks:1,command:{type:'retreat'}});
  e.snapshot.commandCount=8;assert.throws(()=>advanceIntent(e,1,{type:'retreat'}),/eight/);
  assert.throws(()=>advanceIntent(e,0),/active/);
});
test('only the current owned bounded event projection is accepted for publication',()=>{
  const e=encounter();assert.equal(checkedEncounter(e,state()),e);
  assert.throws(()=>checkedEncounter({...e,id:'other-company'},state()),/Invalid/);
  assert.throws(()=>checkedEncounter({...e,cursor:{from:0,to:1,total:3000,next:1}},state()),/Invalid/);
  assert.throws(()=>checkedEncounter({...e,events:[{sequence:2,tick:2}]},state()),/Invalid/);
  assert.throws(()=>checkedEncounter(null,state()),/Missing/);
  assert.equal(checkedEncounter(e,{companyId:'legacy'}),null);
});
test('battle HUD reports the accepted server snapshot and disclosure shows actual quoted write-off',()=>{
  const e=encounter();assert.match(battleControls(e,{disabled:false,playing:false,speed:2}),/88\/100/);
  const quote={disclosures:{accounting:{operatingExpensePence:0,cargoWriteOffBasisPence:40400,capitalSpendPence:0},consequences:{hullAfter:100,capacityAfter:40,locationAfter:'earth',battleRequired:false,cargoRemoved:[{commodityId:'aurelia',quantity:2}]}}};
  const copy=quoteConsequences(quote);assert.match(copy,/2 Aurelia/);assert.match(copy,/£404\.00/);assert.doesNotMatch(copy,/victory|guaranteed/);
});
