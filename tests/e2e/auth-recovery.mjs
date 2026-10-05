// Real server/SDK/PostgreSQL seam; provider wire fixture is not real Google acceptance.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
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

async function setup() {
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
}
async function cleanup() {
  for(const server of [api,fixture]) if(server) {const done=once(server,'close');server.close();server.closeAllConnections();await done;}
  await pool?.end(); await admin?.end();
}

let browser, vite;
try {
  await setup();
  const a = await login(), b = await login();
  const beforeB = await company(b);
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const uiOrigin = `http://127.0.0.1:${port}`;
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  let ready = false;
  for (let i=0; i<50; i++) { try { if ((await fetch(uiOrigin)).ok) { ready=true; break; } } catch {} await new Promise(r=>setTimeout(r,100)); }
  assert.ok(ready, 'Vite started');
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width:390, height:844 } });
  const page = await context.newPage();
  const installCookie = async g => {
    await context.clearCookies();
    await context.addCookies([{ name:'frontierdom_account', value:g.token, url:uiOrigin, httpOnly:true, sameSite:'Lax' }]);
  };
  await installCookie(a);
  const requests=[], errors=[]; let lose=false;
  page.on('pageerror', e=>errors.push(e.message));
  await page.route(`${uiOrigin}/`, route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="ui"></main><script type="module">import {mountUI} from '/src/ui/index.js';import {createApi} from '/src/client/api.js';mountUI(document.querySelector('#ui'),{api:createApi(),googleAuthOrigin:'https://eyfojjzajbfliuokaplx.supabase.co'});</script>`}));
  await page.route(`${uiOrigin}/api/v1/**`, async route=>{
    const req=route.request(), path=new URL(req.url()).pathname;
    const headers=await req.allHeaders();
    requests.push({path,body:req.postData(),company:headers['x-frontierdom-company-id']});
    const response=await route.fetch({url:base+path,headers:{...headers,origin},maxRedirects:0});
    if(path.endsWith('/commands') && lose) { lose=false; assert.equal(response.status(),200); return route.abort('failed'); }
    await route.fulfill({response});
  });
  await page.goto(uiOrigin); await page.waitForSelector('[aria-label="Company overview"]');
  const initial=(await call('state',{cookie:a.cookie})).body.state;
  assert.equal(requests.filter(r=>r.path.endsWith('/session') && r.body).length,1);
  await page.locator('[data-quantity="medicine"]').fill('1');
  await page.locator('[data-action="quote"][data-id="medicine"]').click(); lose=true;
  await page.locator('[data-action="confirm"]').click(); await page.waitForSelector('[data-action="retry"]:enabled');
  const saved=await page.evaluate(()=>localStorage.getItem('frontierdom.pending.v1'));
  const first=requests.find(r=>r.path.endsWith('/commands'));
  assert.equal(first.company,initial.companyId);
  // Logout revokes the actual opaque SDK-backed session. Pending remains in the UI browser.
  assert.equal((await call('auth/logout',{cookie:a.cookie,body:{}})).status,200);
  await context.clearCookies(); await page.reload(); await page.waitForSelector('[data-action="login"]:enabled');
  assert.equal(await page.evaluate(()=>localStorage.getItem('frontierdom.pending.v1')),saved);
  const fresh=await login(a.u.id); assert.notEqual(fresh.token,a.token);
  const mapping=await admin.query('select company_id from frontierdom.sessions where token_hash=$1',[tokenHash(fresh.token)]);
  if (mapping.rowCount) assert.equal(mapping.rows[0].company_id,initial.companyId,'callback may bind only the existing company');
  await installCookie(fresh); const recoveryStart=requests.length; await page.reload();
  await page.waitForSelector('[data-action="retry"]:enabled');
  assert.equal(requests.slice(recoveryStart).some(r=>r.path.endsWith('/session') && r.body),false,'pending recovery never POSTs session');
  await page.locator('[data-action="retry"]').click();
  await page.waitForFunction(()=>localStorage.getItem('frontierdom.pending.v1')===null);
  const sent=requests.filter(r=>r.path.endsWith('/commands'));
  assert.equal(sent.length,2); assert.deepEqual(sent[1],first);
  const recovered=(await call('state',{cookie:fresh.cookie})).body.state;
  assert.equal(recovered.companyId,initial.companyId);
  assert.equal(recovered.ship.cargo.find(c=>c.commodityId==='medicine').quantity,1);
  assert.equal(recovered.finances.netCashFlowPence,-10020);
  assert.deepEqual((await call('state',{cookie:b.cookie})).body.state,beforeB);
  const count=await admin.query('select count(*)::int as n from frontierdom.companies where auth_user_id=$1',[a.u.id]);
  assert.equal(count.rows[0].n,1); assert.deepEqual(errors,[]);
  await mkdir('artifacts/e2e/auth-recovery',{recursive:true});
  await page.screenshot({path:'artifacts/e2e/auth-recovery/restored.png',fullPage:true});
  console.log('PASS actual rendered UI + pinned SDK + restricted PostgreSQL: lost A response, revoked old cookie, fresh A callback, GET state without POST session, exact body/company-header replay once, one company, B untouched. Provider wire fixture, not real Google acceptance.');
} finally {
  await browser?.close(); vite?.kill(); await cleanup();
}
