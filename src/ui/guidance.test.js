import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, quoteAction, applyAction } from '../sim/economy/index.js';
import { voyageObjective, quoteObjective, reviewObjective, guidanceKey, readGuidance, saveGuidance } from './guidance.js';
import { pendingKey } from './commands.js';

const settle = (state, action) => applyAction(state, action, { commandId:crypto.randomUUID(), receiptId:crypto.randomUUID(), occurredAt:'2026-10-05T18:00:00Z' }).state;

test('objectives follow actual cargo and port through medicine, delivery, Aurelia and home', () => {
  let state = createInitialState('captain');
  assert.equal(voyageObjective(state).id,'buy-medicine');
  state = settle(state,{type:'buy',commodityId:'medicine',quantity:20});
  assert.equal(voyageObjective(state).id,'travel-eden');
  state = settle(state,{type:'travel',destinationId:'eden'});
  assert.equal(voyageObjective(state).id,'sell-medicine');
  state = settle(state,{type:'sell',commodityId:'medicine',quantity:20});
  assert.equal(state.cashPence,2604150);
  assert.equal(voyageObjective(state).id,'buy-aurelia');
  assert.equal(voyageObjective(state).title,'Prepare a return cargo');
  state = settle(state,{type:'buy',commodityId:'aurelia',quantity:10});
  assert.equal(voyageObjective(state).id,'travel-earth');
  state = settle(state,{type:'travel',destinationId:'earth'});
  assert.equal(voyageObjective(state).id,'sell-aurelia');
});

test('a returning Eden save with empty hold does not invent a medicine delivery', () => {
  const state=createInitialState('returning'); state.locationId='eden'; state.cashPence=2604150;
  assert.equal(voyageObjective(state).action.commodityId,'aurelia');
  assert.equal(voyageObjective(state).action.type,'buy');
  assert.doesNotMatch(voyageObjective(state).story,/Medicine traded/);
});

test('full or poor companies get a local sale or honest market fallback, never impossible sell quantity', () => {
  let state=createInitialState('full'); state=settle(state,{type:'buy',commodityId:'food',quantity:40});
  assert.equal(voyageObjective(state).action.type,'sell');
  state.markets[0].commodities.forEach(c=>c.demandUnits=0); state.cashPence=0;
  assert.equal(voyageObjective(state).panel,'market');
});

test('guided purchase uses exact quotes to leave gate fare, including a smaller affordable load', async () => {
  const state=createInitialState('low-cash'); state.cashPence=55000;
  const api={async quote(action) { const amounts=quoteAction(state,action); return {quote:{action,...amounts}}; }};
  const quote=await quoteObjective(api,state,voyageObjective(state));
  assert.equal(quote.action.quantity,1);
  assert.ok(state.cashPence-quote.debitPence>=35000);
  const outage=Object.assign(new Error('Unavailable'),{code:'UNAVAILABLE'});
  await assert.rejects(quoteObjective({quote:async()=>{throw outage;}},state,voyageObjective(state)),e=>e===outage);
});

test('guidance preference is per company and never reads or removes pending trade storage', () => {
  const values=new Map([[pendingKey(),'exact unresolved intent']]);
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  saveGuidance(storage,'A',false);
  assert.equal(readGuidance(storage,'A'),false); assert.equal(readGuidance(storage,'B'),true);
  saveGuidance(storage,'A',true); assert.equal(values.get(pendingKey()),'exact unresolved intent');
  assert.notEqual(guidanceKey('A'),pendingKey());
});

test('exact zero-cargo quotes offer affordable travel for Earth £351 and Eden £251', async () => {
  for (const [port,cash] of [['earth',35100],['eden',25100]]) {
    const state=createInitialState(port);state.locationId=port;state.cashPence=cash;
    const seen=[];
    const api={async quote(action){seen.push(action);return {quote:{action,...quoteAction(state,action)}};}};
    const reviewed=await reviewObjective(api,state,voyageObjective(state));
    assert.equal(reviewed.quote.action.type,'travel');
    assert.equal(reviewed.objective.id,port==='earth' ? 'travel-eden' : 'travel-earth');
    assert.ok(seen.some(a=>a.type==='buy'&&a.quantity===1),'one-unit quote establishes cargo unaffordable');
    assert.ok(reviewed.quote.debitPence<=cash);
    assert.equal(state.revision,0);assert.equal(state.ship.cargo.length,0);
  }
});

test('cargo and fallback-crossing outages propagate without inventing a route quote', async () => {
  const state=createInitialState('outage');state.cashPence=35100;
  const outage=Object.assign(new Error('Offline'),{code:'UNAVAILABLE'});
  await assert.rejects(reviewObjective({quote:async()=>{throw outage;}},state,voyageObjective(state)),e=>e===outage);
  const api={async quote(action){if(action.type==='travel')throw outage;return {quote:{action,...quoteAction(state,action)}};}};
  await assert.rejects(reviewObjective(api,state,voyageObjective(state)),e=>e===outage);
});
