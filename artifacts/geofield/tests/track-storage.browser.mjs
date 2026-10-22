// Run with Vite on 127.0.0.1:5194. Uses disposable browser accounts only.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const outputs=JSON.parse(await fs.readFile(new URL('../../../amplify_outputs.json', import.meta.url),'utf8'));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})});
try {
 const context=await browser.newContext();
 await context.addInitScript(({client})=>{
  Object.defineProperty(navigator,'onLine',{get:()=>false});
  if(!localStorage.getItem('fixture-seeded')) {
   localStorage.setItem(`geofield-account:${client}`,JSON.stringify({user:{id:'quota-fixture',email:'fixture@example.invalid'}}));
   localStorage.setItem('geofield_legacy_data_owner','quota-fixture');
   const track={id:'legacy',name:'Saved hike',startedAt:'2026-10-18T00:00:00Z',visible:true,localRevision:'keep-revision',datasetId:'dataset-fixture',points:Array.from({length:12000},(_,i)=>({latitude:40+i/1000000,longitude:-111,accuracy:5,timestamp:i*10000,segment:0,elevation:1000,elevationAccuracy:3}))};
   localStorage.setItem('geofield_tracks:account:quota-fixture',JSON.stringify([track]));
   localStorage.setItem('geofield_tracks:account:quota-fixture__backup',JSON.stringify([track]));
   localStorage.setItem('fixture-seeded','yes');
  }
  navigator.geolocation.watchPosition=(success)=>{window.gpsSuccess=success;return 42;};
  navigator.geolocation.clearWatch=()=>{};
 },{client:outputs.auth.user_pool_client_id});
 await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5194')?r.continue():r.abort());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5194/track');
 await page.getByRole('button',{name:'Activate',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(async()=>{
   const t=(await import('/src/lib/tracks.ts')).loadTracks()[0];
   return [t.points.length,t.localRevision,t.datasetId,localStorage.getItem('geofield_tracks:account:quota-fixture')];
 }),[12000,'keep-revision','dataset-fixture',null]);
 console.log('PASS migration preserves 12,000 points, revision and dataset; removes verified old copies');
 await page.evaluate(()=>{
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(key.startsWith('quota-fill-')) return original.call(this,key,value);throw new DOMException('Fixture localStorage quota exceeded','QuotaExceededError');};
  try {for(let i=0;i<100;i++)localStorage.setItem(`quota-fill-${i}`,'x'.repeat(200000));}catch{}
 });
 await page.getByRole('button',{name:'Activate',exact:true}).click();
 await page.waitForFunction(()=>Boolean(window.gpsSuccess));
 await page.evaluate(async()=>{
   const t=await import('/src/lib/tracks.ts'); const id=t.trackingStatus().activeId;
   const now=Date.now(); Date.now=()=>now+45000;
   for(let i=0;i<15;i++)window.gpsSuccess({coords:{latitude:40+i*.00008,longitude:-111,accuracy:4,altitude:1000+i,altitudeAccuracy:3},timestamp:now+i*3000});
   await t.updateTrack(id,{name:'Quota hike'});
   await t.stopTracking();
 });
 assert.deepEqual(await page.evaluate(async()=>{
  const t=(await import('/src/lib/tracks.ts')).loadTracks().find(t=>t.name==='Quota hike');return [t.points.length,Boolean(t.stoppedAt)];
 }),[15,true]);
 console.log('PASS recording, concurrent rename, final-point drain and Stop with localStorage writes blocked/full');
 await page.reload();await page.getByRole('button',{name:'Activate',exact:true}).waitFor();
 assert.equal(await page.evaluate(async()=> (await import('/src/lib/tracks.ts')).loadTracks().find(t=>t.name==='Quota hike').points.length),15);
 console.log('PASS offline reload retains hike');
 const failure = await page.evaluate(async()=>{
  const t=await import('/src/lib/tracks.ts');
  const hike=t.loadTracks().find(t=>t.name==='Quota hike');
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(){throw new DOMException('Fixture disk full','QuotaExceededError');};
  let message='';
  try {await t.updateTrack(hike.id,{name:'Must not commit'});}catch(e){message=e.message;}
  finally{IDBObjectStore.prototype.put=put;}
  return [message,t.loadTracks().find(t=>t.id===hike.id).name];
 });
 assert.deepEqual(failure,['Fixture disk full','Quota hike']);
 console.log('PASS failed database transaction preserves committed track');
 const isolation=await page.evaluate(async()=>{
  const key=localStorage.getItem('geofield-active-account-profile');
  const original=localStorage.getItem(key);
  // Free only test-created filler so the test can switch its fake account.
  for(let i=0;i<100;i++)localStorage.removeItem('quota-fill-'+i);
  localStorage.setItem(key,JSON.stringify({user:{id:'other-quota-fixture'}}));
  const storage=await import('/src/lib/track-storage.ts');await storage.initializeTrackStorage();
  const empty=storage.readTrackCache().length;
  localStorage.setItem(key,original);await storage.initializeTrackStorage();
  return [empty,storage.readTrackCache().length];
 });
 assert.deepEqual(isolation,[0,2]);
 console.log('PASS account isolation');
 await page.evaluate(async()=>{
   const t=await import('/src/lib/tracks.ts');const hike=t.loadTracks().find(t=>t.name==='Quota hike');await t.deleteTrack(hike.id);
 });
 await page.reload();await page.getByRole('button',{name:'Activate',exact:true}).waitFor();
 assert.equal(await page.evaluate(async()=> (await import('/src/lib/tracks.ts')).loadTracks(true).find(t=>t.name==='Quota hike').deletedAt != null),true);
 assert.deepEqual(errors,[]);
 console.log('PASS deletion tombstone persists; no browser errors');
 await context.close();
}finally{await browser.close();}
