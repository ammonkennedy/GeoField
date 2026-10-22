// Run against Vite on 127.0.0.1:5195. DOM hit-testing fixture; does not require WebGL or access real account data.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5195')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:5195/login');
 await page.evaluate(async()=>{
  const {mapNavigablePopup}=await import('/src/lib/map-popup-gestures.ts');
  const canvas=document.createElement('div');canvas.id='gesture-map';canvas.style.cssText='position:fixed;inset:0;z-index:10000;background:white;touch-action:none';
  canvas.addEventListener('pointerdown',()=>window.mapDown=(window.mapDown||0)+1);
  document.body.append(canvas);
  const root=document.createElement('div');root.style.cssText='position:fixed;left:30px;top:40px;width:300px;z-index:10001;background:#eee';
  root.innerHTML='<div class="maplibregl-popup-content"><div id="details" style="height:160px;overflow:auto"><p style="height:500px">Trail, fault, or climate information</p></div><button id="download">Download</button></div>';
  root.querySelector('#download').onclick=()=>window.downloaded=true;
  document.body.append(root);
  mapNavigablePopup({getElement:()=>root,on:()=>{}});
 });
 await page.getByRole('button',{name:'Scroll details down'}).waitFor();
 await page.mouse.move(100,100);await page.mouse.down();await page.mouse.move(180,150,{steps:5});await page.mouse.up();
 assert.equal(await page.evaluate(()=>window.mapDown),1);
 await page.touchscreen.tap(100,100);
 assert.equal(await page.evaluate(()=>window.mapDown),2);
 await page.getByRole('button',{name:'Download',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.downloaded),true);
 await page.getByRole('button',{name:'Scroll details down'}).click();
 await page.waitForFunction(()=>document.querySelector('#details').scrollTop>0);
 console.log('PASS mouse/touch reach map through popup text; download and detail scrolling remain usable');
}finally{await browser.close();}
