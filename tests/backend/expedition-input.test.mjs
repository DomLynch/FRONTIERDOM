import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {actionInput} from '../../server/errors.mjs';
import {assertExpeditionAction,expeditionBinding,assertExpeditionQuote} from '../../server/expedition-boundary.mjs';

const id=randomUUID(),other=randomUUID(),enabled={expedition:true};
const parse=action=>actionInput(action,enabled);
test('B actions require explicit opt-in and reject authority, simulation time and unbounded inputs',()=>{
  const actions=[{type:'enroll_expedition'},
    {type:'encounter_choice',encounterId:id,choice:'pay'},
    {type:'encounter_choice',encounterId:id,choice:'drop',cargoSelection:[{commodityId:'medicine',quantity:4}]},
    {type:'encounter_choice',encounterId:id,choice:'run',posture:'balanced',protectCargo:true,retreatHullPercent:40},
    {type:'encounter_choice',encounterId:id,choice:'fight',posture:'aggressive',protectCargo:false,retreatHullPercent:0},
    {type:'battle_advance',encounterId:id,ticks:180},
    {type:'battle_advance',encounterId:id,ticks:1,command:{type:'posture',posture:'defensive'}},
    {type:'repair',points:25},{type:'buy_upgrade',upgradeId:'cargo-bracing'},
    {type:'secure_relay',method:'agreement'}];
  for(const action of actions) {
    assert.deepEqual(parse(action),action);
    assert.throws(()=>actionInput(action),error=>error.code==='INVALID_REQUEST');
    for(const field of ['seed','cashPence','hull','outcome','companyId','tick','events']) {
      assert.throws(()=>parse({...action,[field]:0}),error=>error.code==='INVALID_REQUEST');
    }
  }
  const bad=[{type:'battle_advance',encounterId:id,ticks:181},
    {type:'battle_advance',encounterId:id,ticks:0},
    {type:'battle_advance',encounterId:id,ticks:1,command:{type:'retreat',tick:50}},
    {type:'battle_advance',encounterId:id,ticks:1,command:{type:'posture',posture:'victory'}},
    {type:'encounter_choice',encounterId:id,choice:'drop',cargoSelection:[]},
    {type:'encounter_choice',encounterId:id,choice:'drop',cargoSelection:[{commodityId:'medicine',quantity:1},{commodityId:'medicine',quantity:2}]},
    {type:'encounter_choice',encounterId:id,choice:'pay',cargoSelection:[]},
    {type:'repair',points:0.5},{type:'secure_relay',method:'combat'}];
  for(const action of bad) assert.throws(()=>parse(action),error=>error.code==='INVALID_REQUEST');
  assert.equal(parse({type:'encounter_choice',encounterId:id.toUpperCase(),choice:'pay'}).encounterId,id);
});

test('pending crossing rejects unrelated changes and quotes cannot cross encounter/version boundaries',()=>{
  const state={expedition:{version:1,firstReturnStatus:'pending',pendingJourney:{encounterId:id}}};
  for(const action of [{type:'buy'},{type:'sell'},{type:'travel'},{type:'repair'},{type:'buy_upgrade'},{type:'secure_relay'},{type:'enroll_expedition'}]) {
    assert.throws(()=>assertExpeditionAction(state,action),error=>error.code==='ENCOUNTER_PENDING');
  }
  assert.doesNotThrow(()=>assertExpeditionAction(state,{type:'encounter_choice',encounterId:id}));
  assert.doesNotThrow(()=>assertExpeditionAction(state,{type:'battle_advance',encounterId:id}));
  assert.throws(()=>assertExpeditionAction(state,{type:'battle_advance',encounterId:other}),error=>error.code==='ENCOUNTER_CHANGED');
  assert.throws(()=>assertExpeditionAction({}, {type:'encounter_choice',encounterId:id}),error=>error.code==='ENCOUNTER_CHANGED');
  const quote={rulesVersion:'expedition-1',...expeditionBinding(state)};
  assert.doesNotThrow(()=>assertExpeditionQuote(state,quote));
  for(const changed of [{...quote,pendingEncounterId:other},{...quote,firstReturnStatus:'resolved'},{...quote,rulesVersion:undefined}]) {
    assert.throws(()=>assertExpeditionQuote(state,changed),error=>error.code==='STALE_QUOTE');
  }
});
