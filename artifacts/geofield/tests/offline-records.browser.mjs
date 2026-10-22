// Run against Vite at 127.0.0.1:5194. Disposable fixtures only; media checks verify stored bytes, not codec playback.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const outputs=JSON.parse(await fs.readFile(new URL('../../../amplify_outputs.json', import.meta.url),'utf8'));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})});
try{
 const context=await browser.newContext();
 await context.addInitScript(({client})=>{
  Object.defineProperty(navigator,'onLine',{get:()=>false});
  localStorage.setItem(`geofield-account:${client}`,JSON.stringify({user:{id:'offline-audit-fixture',email:'fixture@example.invalid'}}));
 },{client:outputs.auth.user_pool_client_id});
 await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5194')?r.continue():r.abort());
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:5194/track');
 await page.getByRole('button',{name:'Activate',exact:true}).waitFor();
 await page.evaluate(async()=>{
  const datasets=await import('/src/lib/local-datasets.ts');
  const dataset=datasets.createLocalDataset({name:'Offline Δ field trip',description:'Unicode 🌎'});
  datasets.editCloudDatasetOffline('cloud-fixture',{name:'Offline rename'});
  const media=await import('/src/lib/media-storage.ts');
  const photo=await media.storeMediaDataUrl({kind:'photo',dataUrl:'data:image/png;base64,aGVsbG8=',fileName:'fixture.png'});
  const video=await media.storeMediaDataUrl({kind:'video',dataUrl:'data:video/mp4;base64,dmlkZW8=',fileName:'fixture.mp4'});
  const queue=await import('/src/lib/offline-queue.ts');
  for(const sampleType of ['water','rock','soil_sand','other'])queue.enqueue({sampleId:'Offline '+sampleType,sampleType,folderId:dataset.id,notes:'Custom fields retained',fields:{location:'40.1234567, -111.7654321',customParams:[{label:'Trace Δ',value:'0.0000001'}],media:[{...photo,localKey:photo.storageKey},{...video,localKey:video.storageKey}]}});
  const notes=await import('/src/lib/field-notes.ts');const note=notes.createFieldNote('offline-audit-fixture');
  notes.editFieldNote('offline-audit-fixture',note.id,n=>({...n,title:'Offline note',body:'Multiline\nΔ',photos:[{id:photo.id,kind:'photo',fileName:photo.fileName,localKey:photo.storageKey},{id:video.id,kind:'video',fileName:video.fileName,localKey:video.storageKey}]}));
  const folders=await import('/src/lib/note-folders.ts');const folder=folders.createNoteFolder('offline-audit-fixture','Field notes');
  folders.updateFolderNotes('offline-audit-fixture',folder.id,[note.id]);
  const now=new Date().toISOString();
  const measurements=await import('/src/lib/strike-dip-measurements.ts');
  measurements.saveMeasurements([{id:'plane-fixture',label:'Plane',strike:'45',dip:'30',datasetId:dataset.id,date:now,location:'40,-111'},{id:'line-fixture',label:'Lineation',measurementType:'lineation',trendDegrees:120,plungeDegrees:35,datasetId:dataset.id,date:now,location:'40,-111'}]);
  const trips=await import('/src/lib/trips.ts');trips.saveTrips([{id:'trip-fixture',name:'Offline trip',notes:'Target',createdAt:now,updatedAt:now,datasetId:dataset.id,sites:[{id:'planned-fixture',name:'Future sample',description:'Find here',lat:40.1,lng:-111.2,addedAt:now}]}]);
  await (await import('/src/lib/tracks.ts')).storeTracks([{id:'track-fixture',name:'Offline hike',startedAt:now,stoppedAt:now,points:[{latitude:40,longitude:-111,accuracy:4,timestamp:Date.now(),segment:0,elevation:1000,elevationAccuracy:3}],visible:true,localRevision:'fixture-revision',datasetId:String(dataset.id)}]);
 });
 await page.reload();await page.getByRole('button',{name:'Activate',exact:true}).waitFor();
 const result=await page.evaluate(async()=>{
  const queue=(await import('/src/lib/offline-queue.ts')).getQueue();
  const notes=(await import('/src/lib/field-notes.ts')).loadFieldNotes('offline-audit-fixture');
  const read=(await import('/src/lib/media-storage.ts')).getStoredMediaDataUrl;
  return {
   samples:queue.length,
   fields:queue.every(s=>s.payload.fields.customParams[0].value==='0.0000001'),
   media:await Promise.all(notes[0].photos.map(p=>read(p.localKey))),
   datasets:(await import('/src/lib/local-datasets.ts')).getPendingLocalDatasets().length,
   measurements:(await import('/src/lib/strike-dip-measurements.ts')).loadMeasurements().length,
   sites:(await import('/src/lib/trips.ts')).loadTrips()[0].sites.length,
   folders:(await import('/src/lib/note-folders.ts')).loadNoteFolders('offline-audit-fixture')[0].noteIds[0]===notes[0].id,
   tracks:(await import('/src/lib/tracks.ts')).loadTracks()[0].points.length
  };
 });
 assert.deepEqual(result,{samples:4,fields:true,media:['data:image/png;base64,aGVsbG8=','data:video/mp4;base64,dmlkZW8='],datasets:2,measurements:2,sites:1,folders:true,tracks:1});
 console.log('PASS offline save/reload: all four sample types, custom field precision, datasets and offline rename, plane/lineation, notes/photo/video bytes, note membership, trip target and track points');
}finally{await browser.close();}
