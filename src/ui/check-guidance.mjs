// Narrow synthetic-snapshot browser check; real kernel quotes, no database/provider claim.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createInitialState, quoteAction } from '../sim/economy/index.js';
const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
const port=listener.address().port;await new Promise(r=>listener.close(r));
const origin=`http://127.0.0.1:${port}`, output='artifacts/ui/checkpoint-a/fallback';
await mkdir(output,{recursive:true});
const vite=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser;
try {
  let ready=false;
  for(let i=0;i<50;i++){try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready);browser=await chromium.launch({args:['--no-sandbox']});
  for(const [port,cash,outage] of [['earth',35100,false],['eden',25100,false],['earth',35100,true]]) {
    const page=await browser.newPage({viewport:{width:390,height:844}}),state=createInitialState(`${port}-${outage}`);
    state.locationId=port;state.cashPence=cash;const requests=[];
    await page.route(`${origin}/`,r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="ui"></main><script type="module">import {mountUI} from '/src/ui/index.js';import {createApi} from '/src/client/api.js';mountUI(document.querySelector('#ui'),{api:createApi(),googleAuthOrigin:'https://eyfojjzajbfliuokaplx.supabase.co'});</script>`}));
    await page.route(`${origin}/api/v1/**`,async route=>{
      const path=new URL(route.request().url()).pathname.split('/').at(-1),input=route.request().postDataJSON();
      const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({apiVersion:1,...body})});
      if(path==='session'&&route.request().method()==='GET')return reply({user:{id:'captain',displayName:'Captain'},provider:'google'});
      if(path==='session'||path==='state')return reply({state});
      if(path==='quotes'){
        requests.push(input.action);
        try{
          if(outage)throw Object.assign(new Error('Provider unavailable'),{code:'UNAVAILABLE'});
          return reply({quote:{id:crypto.randomUUID(),action:input.action,expectedRevision:state.revision,expiresAt:new Date(Date.now()+60000).toISOString(),...quoteAction(state,input.action)}});
        }catch(e){return reply({error:{code:e.code,message:e.message,retryable:e.code==='UNAVAILABLE'}},e.code==='UNAVAILABLE'?503:409);}
      }
      assert.fail(`unexpected mutation ${path}`);
    });
    await page.goto(origin);await page.waitForSelector('[data-action="next"]:enabled');
    await page.locator('[data-action="next"]').click();
    if(outage){
      await page.waitForSelector('.fd-error');assert.match(await page.locator('.fd-error').innerText(),/unavailable/);
      assert.equal(await page.locator('[role="dialog"]').count(),0);assert.equal(requests.some(a=>a.type==='travel'),false);
    }else{
      await page.waitForSelector('[role="dialog"]');assert.match(await page.locator('#fd-confirm-title').innerText(),/Travel to/);
      assert.ok(requests.some(a=>a.type==='buy'&&a.quantity===1));
      await page.locator('[data-action="cancel"]').click();
      assert.match(await page.locator('[data-action="next"]').innerText(),/Review crossing/);
      assert.match(await page.locator('.fd-story').innerText(),/No cargo load fits/);
      const count=requests.filter(a=>a.type==='buy').length;
      await page.locator('[data-action="next"]').click();await page.waitForSelector('[role="dialog"]');
      assert.equal(requests.filter(a=>a.type==='buy').length,count,'next action now reviews viable route');
      await page.screenshot({path:`${output}/${port}-crossing.png`});
    }
    assert.equal(state.revision,0);assert.equal(state.cashPence,cash);await page.close();
  }
  console.log('PASS visible Earth £351/Eden £251 exact-zero-cargo fallback to quoted crossing; cancel/resume retains useful primary action; outage stays error with no invented travel quote. Synthetic snapshots + actual Economy kernel, no settlement/provider acceptance.');
} finally {await browser?.close();vite.kill();}
