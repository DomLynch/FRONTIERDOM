import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { randomUUID, generateKeyPairSync, sign, verify, createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createPool } from '../../server/database.mjs';
import { createService,tokenHash } from '../../server/service.mjs';
import { createAccountAuth } from '../../server/auth.mjs';
import { createSupabaseAuth } from '../../server/supabase-auth.mjs';
import { createApiServer } from '../../server/http.mjs';
import * as economy from '../../src/sim/economy/index.js';

const origin='https://frontierdom.com';
const key=Buffer.alloc(32,19); // Isolated fixture key, never a production secret.
let pool,admin,api,fixture,base,auth,service,supabaseUrl;
let unavailable=false,refreshes=0;
const codes=new Map(),refreshTokens=new Map();
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk={...keys.publicKey.export({format:'jwk'}),kid:'fixture-1',alg:'ES256',use:'sig'};
const user=id=>({id,aud:'authenticated',email:'fixture@example.invalid',role:'authenticated',
  app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'Fixture Captain'},
  identities:[{provider:'google',user_id:id,id:randomUUID()}],created_at:new Date().toISOString()});
function access(u,sid,offset=3600) {
  const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  const body=`${encoded({alg:'ES256',typ:'JWT',kid:jwk.kid})}.${encoded({iss:`${supabaseUrl}/auth/v1`,sub:u.id,
    aud:'authenticated',role:'authenticated',iat:now,exp:now+offset,session_id:sid})}`;
  return `${body}.${sign('sha256',Buffer.from(body),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
}
function decode(token) {
  const [header,payload,signature]=token.split('.');
  if(!verify('sha256',Buffer.from(`${header}.${payload}`),{key:keys.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'))) throw new Error('bad signature');
  return JSON.parse(Buffer.from(payload,'base64url').toString());
}
function session(u,sid) {
  const refresh_token=randomUUID(); refreshTokens.set(refresh_token,{u,sid});
  return {access_token:access(u,sid),refresh_token,token_type:'bearer',expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user:u,provider_token:'test-google-token-to-strip'};
}
async function body(req) { const parts=[]; for await(const part of req) parts.push(part); return JSON.parse(Buffer.concat(parts).toString()||'{}'); }
async function call(path,{cookie,method,body:input,headers={}}={}) {
  method ||= input===undefined ? 'GET':'POST';
  const response=await fetch(`${base}/api/v1/${path}`,{method,redirect:'manual',
    headers:{...(method==='POST'?{Origin:origin,'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},
    ...(input===undefined?{}:{body:JSON.stringify(input)})});
  return {status:response.status,headers:response.headers,body:response.status===303 ? null:await response.json()};
}
async function begin(cookie) {
  // Each security test gets its own limiter state; quota behavior is covered by
  // the preserved real-HTTP backend tests, not bypassed in production code.
  await admin.query('delete from frontierdom.rate_buckets');
  const r=await call('auth/google',{cookie,body:{}}); assert.equal(r.status,200,JSON.stringify(r.body));
  return {url:new URL(r.body.url),flow:r.headers.getSetCookie().find(c=>c.startsWith('frontierdom_oauth=')).split(';')[0]};
}
async function issue(flow,id=randomUUID()) {
  const u=user(id),sid=randomUUID(),code=randomUUID();
  await admin.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,id]);
  codes.set(code,{challenge:flow.url.searchParams.get('code_challenge'),u,sid});
  return {code,u,sid};
}
async function login(id,cookie) {
  const flow=await begin(cookie),issued=await issue(flow,id);
  const response=await call(`auth/callback?code=${issued.code}`,{cookie:[flow.flow,cookie].filter(Boolean).join('; ')});
  assert.equal(response.status,303); assert.equal(response.headers.get('location'),'/');
  const accountCookie=response.headers.getSetCookie().find(c=>c.startsWith('frontierdom_account=')).split(';')[0];
  return {...issued,flow,cookie:accountCookie,token:accountCookie.split('=')[1]};
}
async function company(g) { const r=await call('session',{cookie:g.cookie,body:{}}); assert.equal(r.status,200,JSON.stringify(r.body)); return r.body.state; }
async function command(g,action) {
  const q=await call('quotes',{cookie:g.cookie,body:{action}}); assert.equal(q.status,200,JSON.stringify(q.body));
  const input={commandId:randomUUID(),quoteId:q.body.quote.id,expectedRevision:q.body.quote.expectedRevision};
  const current=await call('state',{cookie:g.cookie});
  const companyId=current.body.state.companyId;
  const r=await call('commands',{cookie:g.cookie,body:input,headers:{'X-Frontierdom-Company-Id':companyId}});
  assert.equal(r.status,200,JSON.stringify(r.body)); return {...r,input,companyId};
}

before(async()=>{
  pool=createPool(process.env.DATABASE_URL); admin=createPool(process.env.TEST_ADMIN_DATABASE_URL);
  await admin.query(await readFile(new URL('../../server/auth-schema.sql',import.meta.url),'utf8'));
  await admin.query('create schema auth; create table auth.sessions(id uuid primary key,user_id uuid not null);');
  await admin.query(await readFile(new URL('../../supabase/auth-grants.sql',import.meta.url),'utf8'));
  fixture=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    const respond=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
    try {
      const url=new URL(req.url,supabaseUrl);
      if(unavailable) return respond(503,{msg:'fixture unavailable'});
      if(url.pathname==='/auth/v1/.well-known/jwks.json') return respond(200,{keys:[jwk]});
      if(url.pathname==='/auth/v1/token') {
        const value=await body(req);
        if(url.searchParams.get('grant_type')==='pkce') {
          const entry=codes.get(value.auth_code);
          if(!entry || createHash('sha256').update(value.code_verifier||'').digest('base64url')!==entry.challenge) return respond(400,{msg:'PKCE rejected',code:'bad_code_verifier'});
          codes.delete(value.auth_code); return respond(200,session(entry.u,entry.sid));
        }
        const entry=refreshTokens.get(value.refresh_token);
        if(!entry) return respond(400,{msg:'Invalid refresh',code:'refresh_token_not_found'});
        refreshTokens.delete(value.refresh_token); refreshes++; return respond(200,session(entry.u,entry.sid));
      }
      const claims=decode((req.headers.authorization||'').replace(/^Bearer /,''));
      if(claims.exp<=Date.now()/1000) return respond(401,{msg:'Expired',code:'bad_jwt'});
      if(url.pathname==='/auth/v1/user') return respond(200,user(claims.sub));
      if(url.pathname==='/auth/v1/logout') { await admin.query('delete from auth.sessions where id=$1',[claims.session_id]); return respond(200,{}); }
      return respond(404,{msg:'not found'});
    } catch { return respond(401,{msg:'Invalid token',code:'bad_jwt'}); }
  });
  fixture.listen(0,'127.0.0.1'); await once(fixture,'listening');
  supabaseUrl=`http://127.0.0.1:${fixture.address().port}`;
  const provider=createSupabaseAuth({url:supabaseUrl,publishableKey:'sb_publishable_isolated_fixture',
    callbackUrl:`${origin}/api/v1/auth/callback`,allowTestHttp:true});
  auth=createAccountAuth({pool,provider,encryptionKey:key.toString('base64')}); service=createService(pool,economy);
  api=createApiServer({service,auth,authMode:'supabase',siteOrigin:origin,secureCookies:true});
  api.listen(0,'127.0.0.1'); await once(api,'listening'); base=`http://127.0.0.1:${api.address().port}`;
});
after(async()=>{
  for(const server of [api,fixture]) if(server) {const done=once(server,'close');server.close();server.closeAllConnections();await done;}
  await pool?.end(); await admin?.end();
});

test('production denies guest bootstrap and spoofed identity; PKCE URL and opaque cookies are fixed',async()=>{
  const count=await admin.query('select count(*)::int as count from frontierdom.companies');
  assert.equal((await call('auth/session')).body.user,null);
  assert.equal((await call('session',{body:{}})).status,401);
  assert.equal((await call('session',{cookie:'frontierdom_session='+randomBytes(32).toString('base64url'),body:{}})).status,401);
  assert.equal((await admin.query('select count(*)::int as count from frontierdom.companies')).rows[0].count,count.rows[0].count);
  assert.throws(()=>createApiServer({service,authMode:'guest',siteOrigin:origin,secureCookies:true}),/Guest mode/);
  const flow=await begin();
  assert.equal(flow.url.origin,supabaseUrl); assert.equal(flow.url.pathname,'/auth/v1/authorize');
  assert.equal(flow.url.searchParams.get('redirect_to'),`${origin}/api/v1/auth/callback`);
  assert.equal(flow.url.searchParams.get('provider'),'google'); assert.ok(flow.url.searchParams.get('code_challenge'));
  const evil=await call('auth/google',{body:{},headers:{Origin:'https://evil.invalid'}});assert.equal(evil.status,403);
});

test('actual pinned SDK exchanges PKCE, verifies JWT/user, stores encrypted tokens and returns no browser token',async()=>{
  const g=await login();
  const identity=await call('auth/session',{cookie:g.cookie});
  assert.equal(identity.status,200); assert.equal(identity.body.user.id,g.u.id); assert.equal(identity.body.provider,'google');
  assert.equal(identity.body.user.displayName,'Fixture Captain');
  assert.ok(!JSON.stringify(identity.body).includes('access_token'));
  const state=await company(g); assert.equal(state.cashPence,2500000);assert.equal(state.crew.length,3);
  const {rows:[record]}=await admin.query('select sealed_storage from frontierdom.account_sessions where token_hash=$1',[tokenHash(g.token)]);
  assert.ok(!record.sealed_storage.includes('refresh_token')&&!record.sealed_storage.includes('Fixture Captain'));
  const cookie=(await call('auth/google',{cookie:g.cookie,body:{}})).headers.get('set-cookie');
  assert.match(cookie,/HttpOnly; SameSite=Lax; Path=\/api\/v1\/auth\/callback; Max-Age=600; Secure/);
});

test('managed Auth schema denial still permits narrow live-session verification and remote revocation',async()=>{
  // Hosted postgres cannot grant USAGE on the managed auth schema. Match that
  // restriction rather than accepting the more permissive local bootstrap.
  await admin.query('revoke usage on schema auth from frontierdom_backend');
  try {
    assert.equal((await pool.query("select has_schema_privilege(current_user,'auth','USAGE') as allowed")).rows[0].allowed,false);
    await assert.rejects(pool.query('select id from auth.sessions limit 0'),error=>error.code==='42501');
    const g=await login();
    assert.equal((await call('auth/session',{cookie:g.cookie})).body.user.id,g.u.id);
    assert.equal((await pool.query('select frontierdom.auth_session_alive($1,$2) as alive',[g.sid,randomUUID()])).rows[0].alive,false);
    for(const role of ['anon','authenticated','service_role']) {
      assert.equal((await admin.query("select has_function_privilege($1,'frontierdom.auth_session_alive(uuid,uuid)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
    }
    await admin.query('delete from auth.sessions where id=$1',[g.sid]);
    assert.equal((await call('auth/session',{cookie:g.cookie})).body.user,null);
    assert.equal((await pool.query('select frontierdom.auth_session_alive($1,$2) as alive',[g.sid,g.u.id])).rows[0].alive,false);
  } finally {
    await admin.query('revoke usage on schema auth from frontierdom_backend');
  }
});

test('callback rejects missing/expired/mismatched/replayed verifier and open redirects without company creation',async()=>{
  assert.equal((await call('auth/callback?code=stolen')).headers.get('location'),'/?auth=failed');
  const a=await begin(),b=await begin(),issued=await issue(a);
  assert.equal((await call(`auth/callback?code=${issued.code}`,{cookie:b.flow})).headers.get('location'),'/?auth=failed');
  const valid=await call(`auth/callback?code=${issued.code}`,{cookie:a.flow});assert.equal(valid.headers.get('location'),'/');
  assert.equal((await call(`auth/callback?code=${issued.code}`,{cookie:a.flow})).headers.get('location'),'/?auth=failed');
  const expired=await begin(),e=await issue(expired);
  await admin.query("update frontierdom.oauth_flows set expires_at=now()-interval '1 second' where token_hash=$1",[tokenHash(expired.flow.split('=')[1])]);
  assert.equal((await call(`auth/callback?code=${e.code}`,{cookie:expired.flow})).headers.get('location'),'/?auth=failed');
  const redirect=await begin(),r=await issue(redirect);
  assert.equal((await call(`auth/callback?code=${r.code}&next=https://evil.invalid`,{cookie:redirect.flow})).headers.get('location'),'/?auth=failed');
  const cancel=await begin();
  assert.equal((await call('auth/callback?error=access_denied&error_description=secret',{cookie:cancel.flow})).headers.get('location'),'/?auth=cancelled');
});

test('two devices concurrently initialize only one company for verified user and preserve replay across device sessions',async()=>{
  const a=await login(),b=await login(a.u.id);
  const result=await Promise.all([company(a),company(b),company(a)]);
  assert.equal(new Set(result.map(state=>state.companyId)).size,1);
  const count=await admin.query('select count(*)::int as count from frontierdom.companies where auth_user_id=$1',[a.u.id]);
  assert.equal(count.rows[0].count,1);
  const buy=await command(a,{type:'buy',commodityId:'food',quantity:2});
  const replay=await call('commands',{cookie:b.cookie,body:buy.input,headers:{'X-Frontierdom-Company-Id':buy.companyId}});
  assert.equal(replay.status,200);assert.deepEqual(replay.body,{...buy.body,replayed:true});
  const c=await login();await company(c);
  assert.equal((await call('commands',{cookie:c.cookie,body:buy.input,headers:{'X-Frontierdom-Company-Id':buy.companyId}})).body.error.code,'ACCOUNT_CHANGED');
});

function mutateStorage(record,binding,change) {
  const data=Buffer.from(record,'base64'),decrypt=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
  decrypt.setAAD(Buffer.from(binding));decrypt.setAuthTag(data.subarray(12,28));
  const storage=JSON.parse(Buffer.concat([decrypt.update(data.subarray(28)),decrypt.final()]));change(storage);
  const iv=randomBytes(12),encrypt=createCipheriv('aes-256-gcm',key,iv);encrypt.setAAD(Buffer.from(binding));
  const encrypted=Buffer.concat([encrypt.update(JSON.stringify(storage)),encrypt.final()]);
  return Buffer.concat([iv,encrypt.getAuthTag(),encrypted]).toString('base64');
}

test('expired access refresh is serialized and persisted; forged signed identity cannot authorize',async()=>{
  const g=await login();await company(g);
  const digest=tokenHash(g.token);
  const {rows:[row]}=await admin.query('select sealed_storage from frontierdom.account_sessions where token_hash=$1',[digest]);
  const changed=mutateStorage(row.sealed_storage,`account:${digest}`,storage=>{
    const saved=JSON.parse(storage['frontierdom-auth']); saved.expires_at=Math.floor(Date.now()/1000)-60; saved.access_token=access(g.u,g.sid,-60); storage['frontierdom-auth']=JSON.stringify(saved);
  });
  await admin.query('update frontierdom.account_sessions set sealed_storage=$2 where token_hash=$1',[digest,changed]);
  const beforeRefresh=refreshes;
  const responses=await Promise.all([call('auth/session',{cookie:g.cookie}),call('auth/session',{cookie:g.cookie})]);
  assert.ok(responses.every(r=>r.status===200&&r.body.user.id===g.u.id));assert.equal(refreshes,beforeRefresh+1);
  const latest=await admin.query('select sealed_storage from frontierdom.account_sessions where token_hash=$1',[digest]);
  const forged=mutateStorage(latest.rows[0].sealed_storage,`account:${digest}`,storage=>{
    const saved=JSON.parse(storage['frontierdom-auth']); const parts=saved.access_token.split('.');
    const claims=JSON.parse(Buffer.from(parts[1],'base64url'));claims.sub=randomUUID();parts[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');
    saved.access_token=parts.join('.');storage['frontierdom-auth']=JSON.stringify(saved);
  });
  await admin.query('update frontierdom.account_sessions set sealed_storage=$2 where token_hash=$1',[digest,forged]);
  assert.equal((await call('state',{cookie:g.cookie})).status,401);
});

test('remote session deletion denies even unexpired JWT; logout revokes current opaque session and keeps company',async()=>{
  const g=await login();const state=await company(g);
  await admin.query('delete from auth.sessions where id=$1',[g.sid]);
  assert.equal((await call('auth/session',{cookie:g.cookie})).body.user,null);
  assert.equal((await call('state',{cookie:g.cookie})).status,401);
  const fresh=await login(g.u.id);assert.equal((await company(fresh)).companyId,state.companyId);
  const response=await call('auth/logout',{cookie:fresh.cookie,body:{}});assert.equal(response.status,200);
  assert.match(response.headers.get('set-cookie'),/Max-Age=0; Secure/);
  assert.equal((await call('state',{cookie:fresh.cookie})).status,401);
  const rows=await admin.query('select id from auth.sessions where id=$1',[fresh.sid]);assert.equal(rows.rowCount,0);
  const count=await admin.query('select count(*)::int as count from frontierdom.companies where id=$1',[state.companyId]);assert.equal(count.rows[0].count,1);
});

test('provider outage never creates guest or false logout success; local revocation remains committed',async()=>{
  const g=await login();const state=await company(g);
  unavailable=true;
  try {
    assert.equal((await call('auth/session',{cookie:g.cookie})).status,503);
    assert.equal((await call('session',{cookie:g.cookie,body:{}})).status,503);
    const logout=await call('auth/logout',{cookie:g.cookie,body:{}});assert.equal(logout.status,503);
    assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  } finally {unavailable=false;}
  assert.equal((await call('state',{cookie:g.cookie})).status,401);
  const rows=await admin.query('select id from frontierdom.companies where auth_user_id=$1',[g.u.id]);assert.equal(rows.rows[0].id,state.companyId);
});

test('lost A response plus session switch returns ACCOUNT_CHANGED before replay/settlement; original A recovers',async()=>{
  const a=await login(),initial=await company(a);
  const committed=await command(a,{type:'buy',commodityId:'medicine',quantity:2});
  // Client did not receive committed.body; A's preflight passes, then its
  // cookie switches to B just before POST. Header remains A's durable company.
  assert.equal((await call('auth/session',{cookie:a.cookie})).body.user.id,a.u.id);
  assert.equal((await call('state',{cookie:a.cookie})).body.state.companyId,initial.companyId);
  const b=await login(),beforeB=await company(b);
  const raced=await call('commands',{cookie:b.cookie,body:committed.input,headers:{'X-Frontierdom-Company-Id':initial.companyId}});
  assert.equal(raced.status,409);assert.equal(raced.body.error.code,'ACCOUNT_CHANGED');
  assert.deepEqual((await call('state',{cookie:b.cookie})).body.state,beforeB);
  assert.equal((await call('commands',{cookie:b.cookie,body:committed.input})).status,400);
  const newB=await login();
  assert.equal((await call('state',{cookie:newB.cookie})).status,401);
  assert.equal((await admin.query('select count(*)::int as count from frontierdom.companies where auth_user_id=$1',[newB.u.id])).rows[0].count,0);
  assert.equal((await call('auth/logout',{cookie:a.cookie,body:{}})).status,200);
  const again=await login(a.u.id);
  // Recovery cannot initialize a company: the UI goes straight to GET state
  // after the fresh callback, then replays the original bytes and company ID.
  const restored=await call('state',{cookie:again.cookie});
  assert.equal(restored.status,200,JSON.stringify(restored.body));
  assert.deepEqual(restored.body.state,committed.body.state);
  const recovered=await call('commands',{cookie:again.cookie,body:committed.input,headers:{'X-Frontierdom-Company-Id':initial.companyId}});
  assert.equal(recovered.status,200);
  assert.deepEqual(recovered.body,{...committed.body,replayed:true});
  assert.deepEqual((await call('state',{cookie:b.cookie})).body.state,beforeB);
  const records=await admin.query('select count(*)::int as count from frontierdom.commands where company_id=$1 and command_id=$2',[initial.companyId,committed.input.commandId]);
  assert.equal(records.rows[0].count,1);
  assert.equal((await admin.query('select count(*)::int as count from frontierdom.companies where auth_user_id=$1',[a.u.id])).rows[0].count,1);
});

test('new Auth service recovers encrypted account session and logout waits for in-flight economic commit',async()=>{
  const g=await login();const state=await company(g);
  const restarted=createAccountAuth({pool,encryptionKey:key.toString('base64'),
    provider:createSupabaseAuth({url:supabaseUrl,publishableKey:'sb_publishable_isolated_fixture',
      callbackUrl:`${origin}/api/v1/auth/callback`,allowTestHttp:true})});
  assert.equal((await restarted.session(g.token)).user.id,g.u.id);
  const q=await call('quotes',{cookie:g.cookie,body:{action:{type:'buy',commodityId:'food',quantity:1}}});
  const payload={commandId:randomUUID(),quoteId:q.body.quote.id,expectedRevision:q.body.quote.expectedRevision};
  let release,entered;
  const locked=new Promise(resolve=>{entered=resolve;});
  const proceed=new Promise(resolve=>{release=resolve;});
  const running=auth.withUser(g.token,async({client})=>{
    const result=await service.command(g.token,payload,client,state.companyId);entered();await proceed;return result;
  });
  await locked;
  let finished=false;
  const logout=call('auth/logout',{cookie:g.cookie,body:{}}).then(result=>{finished=true;return result;});
  try {
    let waiting=false;
    for(let n=0;n<30;n++) {
      const {rows}=await admin.query("select 1 from pg_stat_activity where wait_event='transactionid' and query like 'select * from frontierdom.account_sessions%'");
      if(rows.length) {waiting=true;break;}
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.ok(waiting);assert.equal(finished,false);
  } finally {release();}
  const result=await running;assert.equal(result.state.revision,1);
  assert.equal((await logout).status,200);
  assert.equal((await call('state',{cookie:g.cookie})).status,401);
  const records=await admin.query('select response from frontierdom.commands where company_id=$1 and command_id=$2',[state.companyId,payload.commandId]);
  assert.equal(records.rows[0].response.state.revision,1);
});
