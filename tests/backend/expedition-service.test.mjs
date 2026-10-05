import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createPool} from '../../server/database.mjs';
import {createService} from '../../server/service.mjs';
import {createApiServer} from '../../server/http.mjs';
import * as economy from '../../src/sim/economy/index.js';
let pool,admin,server,base;
const origin='http://localhost:5173';
async function call(path,{cookie,body,headers={}}={}) {
  const response=await fetch(`${base}/api/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
}
async function guest() {
  await admin.query('delete from frontierdom.rate_buckets');
  const response=await fetch(`${base}/api/v1/session`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],state:(await response.json()).state};
}
async function quote(g,action) {
  const result=await call('quotes',{cookie:g.cookie,body:{action}});assert.equal(result.status,200,JSON.stringify(result.body));return result.body.quote;
}
async function send(g,input) { return call('commands',{cookie:g.cookie,body:input,headers:{'X-Frontierdom-Company-Id':g.state.companyId}}); }
async function command(g,action) {
  const q=await quote(g,action),input={commandId:randomUUID(),quoteId:q.id,expectedRevision:q.expectedRevision};
  const result=await send(g,input);assert.equal(result.status,200,JSON.stringify(result.body));return {...result,input,quote:q};
}
async function opening() {
  const g=await guest();
  for(const action of [{type:'enroll_expedition'},{type:'buy',commodityId:'medicine',quantity:20},{type:'travel',destinationId:'eden'},
    {type:'sell',commodityId:'medicine',quantity:20},{type:'buy',commodityId:'aurelia',quantity:20}]) await command(g,action);
  return g;
}
async function fixtureReturn({cargo=false}={}) {
  const g=await guest(),state=structuredClone(g.state);
  state.locationId='eden';state.cashPence=25000;state.expedition.enrolled=true;
  if(cargo) state.ship.cargo=[{commodityId:'aurelia',quantity:20,costBasisPence:408400}];
  await admin.query('update frontierdom.companies set state=$2 where id=$1',[state.companyId,state]);return g;
}
before(async()=>{
  pool=createPool(process.env.DATABASE_URL);admin=createPool(process.env.TEST_ADMIN_DATABASE_URL);
  await admin.query(await readFile(new URL('../../server/expedition-schema.sql',import.meta.url),'utf8'));
  server=createApiServer({service:createService(pool,economy,{expedition:true}),authMode:'guest',siteOrigin:origin,secureCookies:false});
  server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server){const done=once(server,'close');server.close();server.closeAllConnections();await done;}await pool?.end();await admin?.end();});

test('legacy migration retains money, cargo, markets, history and revision; A quotes remain stale but A command replays survive',async()=>{
  const g=await guest();await command(g,{type:'buy',commodityId:'medicine',quantity:2});
  const before=(await call('state',{cookie:g.cookie})).body.state;
  const legacy=structuredClone(before);delete legacy.expedition;
  for(const key of ['operatingExpensePence','cargoWriteOffBasisPence','capitalSpendPence']) delete legacy.finances[key];
  await admin.query('update frontierdom.companies set state=$2 where id=$1',[g.state.companyId,legacy]);
  const restored=(await call('state',{cookie:g.cookie})).body.state;
  assert.equal(restored.expedition.enrolled,false);
  const stripped=structuredClone(restored);delete stripped.expedition;
  for(const key of ['operatingExpensePence','cargoWriteOffBasisPence','capitalSpendPence']) delete stripped.finances[key];
  assert.deepEqual(stripped,legacy);
  const a=createService(pool,economy),token=g.cookie.split('=')[1];
  const q=(await a.quote(token,{action:{type:'buy',commodityId:'food',quantity:1}})).quote;
  const input={commandId:randomUUID(),quoteId:q.id,expectedRevision:q.expectedRevision};
  assert.equal((await send(g,input)).body.error.code,'STALE_QUOTE');
  const original=await a.command(token,input,undefined,g.state.companyId);
  await admin.query("update frontierdom.quotes set expires_at=now()-interval '1 second' where id=$1",[q.id]);
  assert.deepEqual((await send(g,input)).body,{...original,replayed:true});
});

test('paid return freezes once; exact expired retry preserves seed, pending guards and pay settlement are atomic',async()=>{
  const g=await opening(),departure=await command(g,{type:'travel',destinationId:'earth'}),pending=departure.body.state.expedition.pendingJourney;
  assert.equal(departure.body.state.locationId,'eden');assert.equal(departure.body.state.cashPence,2170750);
  assert.equal(pending.demands.payPence,81680);assert.equal(pending.demands.dropUnits,4);
  const frozen=(await admin.query('select * from frontierdom.encounters where company_id=$1',[g.state.companyId])).rows[0];
  assert.equal(Number(frozen.seed),pending.seed);assert.equal(frozen.id,pending.encounterId);
  await admin.query("update frontierdom.quotes set expires_at=now()-interval '1 second' where id=$1",[departure.quote.id]);
  assert.deepEqual((await send(g,departure.input)).body,{...departure.body,replayed:true});
  assert.deepEqual((await call('state',{cookie:g.cookie})).body.state,departure.body.state);
  for(const action of [{type:'buy',commodityId:'food',quantity:1},{type:'travel',destinationId:'earth'},{type:'repair',points:1}]) {
    assert.equal((await call('quotes',{cookie:g.cookie,body:{action}})).body.error.code,'ENCOUNTER_PENDING');
  }
  assert.equal((await call('quotes',{cookie:g.cookie,body:{action:{type:'encounter_choice',encounterId:pending.encounterId,choice:'run'}}})).status,503);
  const other=await guest();
  assert.equal((await call('quotes',{cookie:other.cookie,body:{action:{type:'encounter_choice',encounterId:pending.encounterId,choice:'pay'}}})).body.error.code,'ENCOUNTER_CHANGED');
  const q=await quote(g,{type:'encounter_choice',encounterId:pending.encounterId,choice:'pay'});
  assert.equal(q.encounter.demands.payPence,81680);
  const replies=await Promise.all([send(g,{commandId:randomUUID(),quoteId:q.id,expectedRevision:q.expectedRevision}),send(g,{commandId:randomUUID(),quoteId:q.id,expectedRevision:q.expectedRevision})]);
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
  const after=replies.find(r=>r.status===200).body.state;
  assert.equal(after.locationId,'earth');assert.equal(after.cashPence,2089070);assert.equal(after.ship.cargo[0].quantity,20);
  assert.equal(after.expedition.firstReturnStatus,'resolved');assert.equal(after.expedition.pendingJourney,null);
  const stored=(await admin.query('select * from frontierdom.encounters where company_id=$1',[g.state.companyId])).rows[0];
  assert.equal(stored.status,'resolved');assert.equal(stored.choice,'pay');assert.deepEqual(stored.frozen_input,frozen.frozen_input);
  assert.equal((await call('quotes',{cookie:g.cookie,body:{action:q.action}})).body.error.code,'ENCOUNTER_CHANGED');
});

test('zero-cash drop removes exact units/basis once and empty return passes without creating an encounter',async()=>{
  const g=await fixtureReturn({cargo:true}),departure=await command(g,{type:'travel',destinationId:'earth'});
  assert.equal(departure.body.state.cashPence,0);
  const drop=await command(g,{type:'encounter_choice',encounterId:departure.body.state.expedition.pendingJourney.encounterId,choice:'drop',cargoSelection:[{commodityId:'aurelia',quantity:4}]});
  assert.equal(drop.body.state.locationId,'earth');assert.equal(drop.body.state.cashPence,0);
  assert.deepEqual(drop.body.state.ship.cargo,[{commodityId:'aurelia',quantity:16,costBasisPence:326720}]);
  assert.equal(drop.body.state.finances.cargoWriteOffBasisPence,81680);
  assert.deepEqual((await send(g,drop.input)).body,{...drop.body,replayed:true});
  const empty=await fixtureReturn(),returned=await command(empty,{type:'travel',destinationId:'earth'});
  assert.equal(returned.body.state.expedition.firstReturnStatus,'passed_empty');assert.equal(returned.body.state.cashPence,0);assert.equal(returned.body.state.locationId,'earth');
  assert.deepEqual((await send(empty,returned.input)).body,{...returned.body,replayed:true});
  assert.equal((await admin.query('select count(*)::int as count from frontierdom.encounters where company_id=$1',[empty.state.companyId])).rows[0].count,0);
});

test('ledger failure rolls back prepaid fare, frozen seed and pending crossing; same intent can retry once',async()=>{
  const g=await opening(),before=(await call('state',{cookie:g.cookie})).body.state,q=await quote(g,{type:'travel',destinationId:'earth'});
  const input={commandId:randomUUID(),quoteId:q.id,expectedRevision:q.expectedRevision};
  await admin.query(`create function frontierdom.test_expedition_ledger_failure() returns trigger language plpgsql as $$ begin raise exception 'isolated ledger failure'; end $$;
    create trigger expedition_failure before insert on frontierdom.commands for each row execute function frontierdom.test_expedition_ledger_failure();`);
  try {assert.equal((await send(g,input)).status,503);} finally {
    await admin.query('drop trigger expedition_failure on frontierdom.commands; drop function frontierdom.test_expedition_ledger_failure();');
  }
  assert.deepEqual((await call('state',{cookie:g.cookie})).body.state,before);
  assert.equal((await admin.query('select count(*)::int as count from frontierdom.encounters where company_id=$1',[g.state.companyId])).rows[0].count,0);
  const retried=await send(g,input);assert.equal(retried.status,200);assert.equal(retried.body.state.cashPence,2170750);
  assert.deepEqual((await send(g,input)).body,{...retried.body,replayed:true});
});
