import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createPool,transaction} from '../../server/database.mjs';
import {freezeEncounter,loadEncounter,continueEncounter} from '../../server/encounter-store.mjs';
import * as economy from '../../src/sim/economy/index.js';
let pool,admin;
before(async()=>{
  pool=createPool(process.env.DATABASE_URL);admin=createPool(process.env.TEST_ADMIN_DATABASE_URL);
  await admin.query(await readFile(new URL('../../server/expedition-schema.sql',import.meta.url),'utf8'));
});
after(async()=>{await pool?.end();await admin?.end();});
async function company() {
  const id=randomUUID();await admin.query('insert into frontierdom.companies(id,state) values($1,$2)',[id,economy.createInitialState(id)]);return id;
}
const meta=companyId=>({id:randomUUID(),companyId,departureCommandId:randomUUID(),sourceRevision:3,seed:4294967295,input:{startingHull:100,cargo:[{commodityId:'aurelia',quantity:20,costBasisPence:408400}]}});

test('frozen encounter, continuation and schedule survive new DB pool; foreign owner cannot load it',async()=>{
  const owner=await company(),other=await company(),frozen=meta(owner);
  const first=await transaction(pool,async client=>{
    await client.query('select id from frontierdom.companies where id=$1 for update',[owner]);
    return freezeEncounter(client,frozen);
  });
  assert.equal(first.seed,4294967295);assert.deepEqual(first.frozen_input,frozen.input);
  const active=await transaction(pool,async client=>{
    const row=await loadEncounter(client,owner,frozen.id,{lock:true});
    return continueEncounter(client,row,{status:'active',choice:'fight',tick:1,schedule:[{tick:1,type:'posture',posture:'defensive'}],continuation:{version:1,tick:1,seed:frozen.seed,result:null,events:[]}});
  });
  const restarted=createPool(process.env.DATABASE_URL);
  try {
    assert.deepEqual(await loadEncounter(restarted,owner,frozen.id),active);
    await assert.rejects(loadEncounter(restarted,other,frozen.id),error=>error.code==='ENCOUNTER_CHANGED');
    await assert.rejects(loadEncounter(restarted,owner,randomUUID()),error=>error.code==='ENCOUNTER_CHANGED');
  } finally {await restarted.end();}
  assert.deepEqual(active.frozen_input,frozen.input);assert.equal(active.source_revision,3);
  const done=await transaction(pool,client=>continueEncounter(client,active,{status:'resolved',choice:'fight',tick:5,schedule:active.schedule,continuation:{tick:5,result:{outcome:'escaped'}},result:{outcome:'escaped'}}));
  await assert.rejects(continueEncounter(pool,done,{status:'resolved',choice:'fight',tick:5,schedule:done.schedule,continuation:done.continuation,result:done.result}),error=>error.code==='ENCOUNTER_CHANGED');
  assert.deepEqual(await loadEncounter(pool,owner,frozen.id),done);
});

test('encounter write rolls back with failed ledger/state transaction and cannot exceed schedule bounds',async()=>{
  const owner=await company(),frozen=meta(owner);
  await assert.rejects(transaction(pool,async client=>{
    await client.query('select id from frontierdom.companies where id=$1 for update',[owner]);
    await freezeEncounter(client,frozen);
    await client.query("update frontierdom.companies set state=jsonb_set(state,'{cashPence}','1'::jsonb) where id=$1",[owner]);
    throw new Error('injected ledger failure');
  }),/injected ledger failure/);
  await assert.rejects(loadEncounter(pool,owner,frozen.id),error=>error.code==='ENCOUNTER_CHANGED');
  assert.equal((await pool.query('select state from frontierdom.companies where id=$1',[owner])).rows[0].state.cashPence,2500000);
  const row=await transaction(pool,client=>freezeEncounter(client,frozen));
  const base={status:'active',choice:'run',tick:1,schedule:[],continuation:{tick:1}};
  for(const change of [{tick:181},{schedule:[{tick:2,type:'retreat'}]},
    {schedule:Array.from({length:9},()=>({tick:1,type:'retreat'}))},{continuation:{text:'x'.repeat(240001)}}]) {
    await assert.rejects(continueEncounter(pool,row,{...base,...change}));
    assert.deepEqual(await loadEncounter(pool,owner,frozen.id),row);
  }
});

test('encounter schema is forced-RLS and browser roles have no access; only one opening record per company',async()=>{
  const {rows:[flags]}=await admin.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='frontierdom.encounters'::regclass");
  assert.deepEqual(flags,{relrowsecurity:true,relforcerowsecurity:true});
  for(const role of ['anon','authenticated','service_role']) {
    assert.equal((await admin.query("select has_table_privilege($1,'frontierdom.encounters','SELECT') as allowed",[role])).rows[0].allowed,false);
  }
  const owner=await company();await freezeEncounter(pool,meta(owner));
  await assert.rejects(freezeEncounter(pool,meta(owner)),error=>error.code==='23505');
  assert.equal((await pool.query('select count(*)::int as count from frontierdom.encounters where company_id=$1',[owner])).rows[0].count,1);
});
