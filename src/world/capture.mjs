// Visual QA only: real candidate entry point/UI/Application with deterministic API snapshots.
// This never contacts production or claims economic/server acceptance.
import { chromium } from '@playwright/test';
import { createInitialState } from '../sim/economy/index.js';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
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
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(`${outputs}/receipt.json`,JSON.stringify({entryPoint:'built candidate src/main.js',engine:'2.23.0',snapshots:'test-only intercepted authoritative-shape fixtures; no live API/gameplay claim',viewports:[[390,844],[1280,720]],reducedMotion:true,pageErrors:errors},null,2));
}finally{await browser?.close();server.kill('SIGTERM');}
