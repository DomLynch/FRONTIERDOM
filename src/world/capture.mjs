// Visual QA only: real candidate entry point/UI/Application with deterministic API snapshots.
// This never contacts production or claims economic/server acceptance.
import { chromium } from '@playwright/test';
import { createInitialState, quoteAction, applyAction } from '../sim/economy/index.js';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import net from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {PNG}=require(path.join(path.dirname(require.resolve('playwright-core/package.json')),'lib/utilsBundle.js'));
const haloRegion={x:0,y:140,width:320,height:260};
function haloDifference(buffer,reference){
 const actual=PNG.sync.read(buffer);let changed=0;
 for(let y=haloRegion.y;y<haloRegion.y+haloRegion.height;y++)for(let x=haloRegion.x;x<haloRegion.x+haloRegion.width;x++){
  const i=(y*actual.width+x)*4;
  if(Math.max(...[0,1,2].map(c=>Math.abs(actual.data[i+c]-reference.data[i+c])))>4)changed++;
 }
 return changed;
}
const phaseObservations=[];
const outputs = process.env.WORLD_CAPTURE_OUTPUT || '/tmp/frontierdom-world-captures';
await mkdir(outputs, {recursive:true});
const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const server=spawn(process.execPath,['tests/e2e/preview-server.mjs'],{env:{...process.env,FRONTIERDOM_PREVIEW_PORT:String(port)},stdio:'inherit'});
let browser;const errors=[];
try {
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,...(process.env.WORLD_CHROMIUM_EXECUTABLE?{executablePath:process.env.WORLD_CHROMIUM_EXECUTABLE}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const [name,viewport] of [['portrait',{width:390,height:844}],['landscape',{width:1280,height:720}]]){
  for(const locationId of ['earth','eden']){
   const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   const state=createInitialState('visual-fixture');state.locationId=locationId;
   await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const body=path.endsWith('auth/session')?{apiVersion:1,provider:'google',user:{id:'visual-user',displayName:'Visual review'}}:{apiVersion:1,state};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle',timeout:90000});
   await page.waitForTimeout(2000);
   await page.screenshot({path:`${outputs}/${locationId}-${name}-ui.png`});
   await page.evaluate(()=>{document.querySelector('#ui').style.visibility='hidden';});
   await page.waitForTimeout(100);
   await page.screenshot({path:`${outputs}/${locationId}-${name}-scene.png`});
   await context.close();
  }
 }
 // Actual UI→quote→confirmed snapshot→World transit in the same built client.
 // Transport/kernel here are visual fixtures, not production/server acceptance.
 const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,reducedMotion:'no-preference'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 let state=createInitialState('transit-fixture'), quote;
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;let body;
  if(path.endsWith('auth/session'))body={apiVersion:1,provider:'google',user:{id:'transit-user',displayName:'Transit review'}};
  else if(path.endsWith('quotes')) {
   const {action}=route.request().postDataJSON();quote={id:'visual-quote',action,expectedRevision:state.revision,expiresAt:new Date(Date.now()+60000).toISOString(),...quoteAction(state,action)};
   body={apiVersion:1,quote};
  } else if(path.endsWith('commands')) {
   const {commandId}=route.request().postDataJSON();const result=applyAction(state,quote.action,{commandId,receiptId:'visual-receipt',occurredAt:new Date().toISOString()});state=result.state;
   body={apiVersion:1,commandId,state,receipt:result.receipt,replayed:false};
  } else body={apiVersion:1,state};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle'});await page.waitForTimeout(1000);
 await page.screenshot({path:`${outputs}/transit-initial-earth.png`});
 await page.locator('button[data-action="panel"][data-id="route"]').click();
 await page.locator('button[data-action="travel"]').click();
 await page.locator('button[data-action="confirm"]').click();
 const reference=PNG.sync.read(await readFile(`${outputs}/eden-landscape-ui.png`));
 await page.waitForTimeout(100);const confirmed=await page.screenshot({path:`${outputs}/transit-confirmed-eden.png`});
 const confirmedPixels=haloDifference(confirmed,reference);
 if(confirmedPixels<100)throw new Error(`Expected visible crossing halo; changed pixels=${confirmedPixels}`);
 phaseObservations.push({phase:'confirmed',changedPixels:confirmedPixels});
 // Observe the rendered background where the expanding halo passes; stars may
 // affect a few pixels. This reads actual screenshots, not a timer/hidden phase.
 const deadline=Date.now()+30000;let quietFrames=0,settled;
 while(Date.now()<deadline){
  await page.waitForTimeout(500);const buffer=await page.screenshot();const changedPixels=haloDifference(buffer,reference);
  phaseObservations.push({phase:'waiting-for-visible-halo-absence',changedPixels});
  quietFrames=changedPixels<100?quietFrames+1:0;
  if(quietFrames===2){settled=buffer;break;}
 }
 if(!settled)throw new Error(`Crossing halo did not visibly settle within 30s: ${JSON.stringify(phaseObservations)}`);
 await writeFile(`${outputs}/transit-settled-eden.png`,settled);
 await page.reload({waitUntil:'networkidle'});await page.waitForTimeout(400);await page.screenshot({path:`${outputs}/transit-reloaded-eden.png`});
 const reloadPixels=haloDifference(await page.screenshot(),reference);
 phaseObservations.push({phase:'reloaded-no-halo',changedPixels:reloadPixels});
 if(reloadPixels>=100)throw new Error(`Reload displayed crossing halo: ${reloadPixels}`);
 await context.close();
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(`${outputs}/receipt.json`,JSON.stringify({entryPoint:'built candidate src/main.js',engine:'2.23.0',snapshots:'test-only intercepted authoritative-shape fixtures; no live API/gameplay claim',viewports:[[390,844],[1280,720]],reducedMotion:'reduce for composed frames; no-preference for transit frames',pageErrors:errors,visiblePhaseCheck:{region:haloRegion,threshold:100,channelTolerance:4,observations:phaseObservations},transit:'fixture transport through real UI quote/command and accepted state; initial/crossing/settled/reloaded frames retained'},null,2));
}finally{await browser?.close();server.kill('SIGTERM');}
