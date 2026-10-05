// VPS-only visual fixtures through the exact built UI/main/World. No live API claim.
import { chromium } from '@playwright/test';
import { createInitialState, migrateExpeditionState, applyAction, quoteAction, applyBattleProgress, applyBattleSettlement } from '../sim/economy/index.js';
import { beginOpening, advanceOpening, projectEncounter } from '../../server/opening-battle.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';

const output=process.env.WORLD_CAPTURE_OUTPUT || '/tmp/frontierdom-battle-captures';
const company='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
let metadataIndex=0;
const metadata=()=>({commandId:`visual-${++metadataIndex}`,receiptId:`receipt-${metadataIndex}`,occurredAt:'2026-10-05T18:00:00.000Z',encounterId:id,seed:42});
function fixture({hull=100,choice='fight',ticks=4}={}) {
 let state=migrateExpeditionState(createInitialState(company));state.locationId='eden';state.expedition.shipCondition.hull=hull;
 for(const action of [{type:'enroll_expedition'},{type:'buy',commodityId:'aurelia',quantity:20},{type:'travel',destinationId:'earth'}])state=applyAction(state,action,metadata()).state;
 let record={id,seed:42,status:'awaiting_choice',choice:null,tick:0,schedule:[],continuation:null,result:null,
  frozen_input:{pendingJourney:structuredClone(state.expedition.pendingJourney),ship:state.ship,crew:state.crew}};
 const action={type:'encounter_choice',encounterId:id,choice,posture:'balanced',protectCargo:true,retreatHullPercent:40};
 const opening=beginOpening(record,action);record={...record,...opening,battle_input:opening.battleInput};
 state=(opening.result?applyBattleSettlement(state,action,opening.result,metadata()):applyAction(state,action,metadata())).state;
 function advance(action){
  const next=advanceOpening(record,action);record={...record,...next,battle_input:next.battleInput};
  state=(next.result?applyBattleSettlement(state,action,next.result,metadata()):applyBattleProgress(state,action,metadata())).state;
 }
 if(ticks && record.status==='active')advance({type:'battle_advance',encounterId:id,ticks});
 return {get state(){return state;},get projection(){return projectEncounter(record);},advance};
}
await mkdir(output,{recursive:true});
const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const server=spawn(process.execPath,['tests/e2e/preview-server.mjs'],{env:{...process.env,FRONTIERDOM_PREVIEW_PORT:String(port)},stdio:'inherit'});
let browser;const errors=[],receipts=[];
try {
 for(let n=0;n<100;n++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.WORLD_CHROMIUM_EXECUTABLE,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const [orientation,viewport] of [['portrait',{width:390,height:844}],['landscape',{width:1280,height:720}]]){
  for(const [scenario,options] of [['active',{}],['retreat',{choice:'run',ticks:2}],['boarded',{hull:25,ticks:0}]]){
   const f=fixture(options);const context=await browser.newContext({viewport,reducedMotion:'reduce'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let quote;
   await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname;let body;
    if(path.endsWith('auth/session'))body={apiVersion:1,provider:'google',user:{id:'visual-user',displayName:'Battle visual fixture'}};
    else if(path.endsWith('quotes')) {const {action}=route.request().postDataJSON();quote={id:crypto.randomUUID(),action,expectedRevision:f.state.revision,expiresAt:new Date(Date.now()+60000).toISOString(),...quoteAction(f.state,action)};body={apiVersion:1,quote};}
    else if(path.endsWith('commands')) {const {commandId}=route.request().postDataJSON();f.advance(quote.action);body={apiVersion:1,commandId,state:f.state,encounter:f.projection,receipt:f.state.history.at(-1),replayed:false};}
    else body={apiVersion:1,state:f.state,encounter:f.projection};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle'});await page.waitForTimeout(1000);
   if(await page.locator('[role="alert"]').count())throw new Error(await page.locator('[role="alert"]').first().textContent());
   await page.screenshot({path:`${output}/${scenario}-${orientation}-ui.png`});
   await page.evaluate(()=>{document.querySelector('#ui').style.visibility='hidden';});await page.screenshot({path:`${output}/${scenario}-${orientation}-scene.png`});
   await page.evaluate(()=>{document.querySelector('#ui').style.visibility='visible';});
   if(scenario==='active'){
    await page.reload({waitUntil:'networkidle'});await page.waitForTimeout(500);await page.screenshot({path:`${output}/reload-${orientation}-ui.png`});
    // Current accepted terminal result through the real instant control; no browser resolver.
    await page.locator('button[data-action="battle-instant"]').click();
    await page.waitForFunction(()=>!document.querySelector('button[data-action="battle-instant"]'));
    await page.screenshot({path:`${output}/instant-${orientation}-ui.png`});
   }
   receipts.push({scenario,orientation,state:f.state,projection:f.projection});await context.close();
  }
 }
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(`${output}/receipt.json`,JSON.stringify({scope:'Deterministic API-intercepted visual fixtures through built candidate. Frozen actual Backend/Combat/Economy helpers generate fixtures; no live HTTP/PG/auth acceptance.',entry:'src/main.js',viewports:[[390,844],[1280,720]],pageErrors:errors,receipts},null,2));
} finally {await browser?.close();server.kill('SIGTERM');}
