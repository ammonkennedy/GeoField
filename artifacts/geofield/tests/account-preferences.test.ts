import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acknowledgePreference, initializeAccountPreferences, loadAccountPreferences, mergeAccountPreferences, readAccountPreference, writeAccountPreference, type AccountPreference } from '../src/lib/account-preferences.ts';
import { syncPreferenceRecords, type PreferenceSyncStore } from '../src/lib/sync-account-preferences-core.ts';

function device(account = 'owner') {
  const values = new Map<string,string>([['geofield-account:pool', JSON.stringify({user:{id:account}})]]);
  const activate = () => Object.defineProperty(globalThis, 'localStorage', {configurable:true,value:{
    get length(){ return values.size; }, key:(i:number)=>[...values.keys()][i]??null,
    getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>values.set(key,value), removeItem:(key:string)=>values.delete(key),
  }});
  return {values, activate};
}
function fixture() {
  const cloud = new Map<string,AccountPreference>();
  const store = (d:ReturnType<typeof device>):PreferenceSyncStore => ({
    check:()=>d.activate(), load:()=>{d.activate();return loadAccountPreferences();},
    list:async()=>structuredClone([...cloud.values()]),
    put:async e=>{cloud.set(e.revision,structuredClone(e));}, get:async e=>structuredClone(cloud.get(e.revision)),
    acknowledge:e=>{d.activate();acknowledgePreference(e);}, merge:entries=>{d.activate();mergeAccountPreferences(entries);},
  });
  return {cloud,store};
}
test('phone and website exchange defaults independently per sample type, preserving IDs and ordering',async()=>{
  const phone=device(), web=device(), f=fixture();
  phone.activate();
  const water={labels:['Alkalinity'],customIds:['custom-1'],basicOrder:['location','name'],parameterOrder:['custom-1','ph']};
  writeAccountPreference('sample-sheet:water',water);
  await syncPreferenceRecords(f.store(phone)); await syncPreferenceRecords(f.store(web));
  web.activate(); assert.deepEqual(readAccountPreference('sample-sheet:water'),water);
  writeAccountPreference('sample-sheet:rock',{labels:['Grain size']});
  await syncPreferenceRecords(f.store(web)); await syncPreferenceRecords(f.store(phone));
  phone.activate(); assert.deepEqual(readAccountPreference('sample-sheet:rock'),{labels:['Grain size']});
  assert.deepEqual(readAccountPreference('sample-sheet:water'),water);
  assert.equal(loadAccountPreferences().some(e=>e.pending),false);
});
test('failed upload and failed readback preserve pending changes across reopening',async()=>{
  const d=device(),f=fixture(); d.activate();writeAccountPreference('north-reference','magnetic');
  await assert.rejects(syncPreferenceRecords({...f.store(d),put:async()=>{throw Error('offline');}}));
  d.activate();assert.equal(loadAccountPreferences()[0].pending,true);
  await assert.rejects(syncPreferenceRecords({...f.store(d),get:async()=>({})}));
  d.activate();assert.equal(loadAccountPreferences()[0].pending,true);
  await syncPreferenceRecords(f.store(d));d.activate();assert.equal(loadAccountPreferences()[0].pending,false);
});
test('edit made during upload is not acknowledged or overwritten by older upload',async()=>{
  const d=device(),f=fixture();d.activate();writeAccountPreference('north-reference','true');
  const s=f.store(d);
  await syncPreferenceRecords({...s,put:async e=>{await s.put(e);d.activate();writeAccountPreference('north-reference','magnetic');}});
  d.activate();assert.equal(readAccountPreference('north-reference'),'magnetic');assert.equal(loadAccountPreferences()[0].pending,true);
  await syncPreferenceRecords(s);d.activate();assert.equal(loadAccountPreferences()[0].pending,false);
});
test('simultaneous revisions converge and cloud retains both revisions',async()=>{
  const a=device(),b=device(),f=fixture();
  a.activate();writeAccountPreference('north-reference','true');
  b.activate();writeAccountPreference('north-reference','magnetic');
  await syncPreferenceRecords(f.store(a));await syncPreferenceRecords(f.store(b));await syncPreferenceRecords(f.store(a));
  a.activate();const result=readAccountPreference('north-reference');b.activate();assert.equal(readAccountPreference('north-reference'),result);assert.equal(f.cloud.size,2);
});
test('legacy imports yield to cloud settings and cannot migrate into another account',async()=>{
  const d=device(),f=fixture(); d.values.set('geofield_custom_param_templates',JSON.stringify({water:['Old']}));
  d.activate();initializeAccountPreferences();assert.equal(loadAccountPreferences()[0].legacy,true);
  f.cloud.set('remote',{key:'sample-sheet:water',value:{labels:['Current']},revision:'remote',updatedAt:1});
  await syncPreferenceRecords(f.store(d));d.activate();assert.deepEqual(readAccountPreference('sample-sheet:water'),{labels:['Current']});
  assert.ok(d.values.has('geofield_custom_param_templates'));
  d.values.set('geofield-account:pool',JSON.stringify({user:{id:'different'}}));initializeAccountPreferences();assert.deepEqual(loadAccountPreferences(),[]);
});
test('deleted map layer tombstone propagates and is not resurrected',async()=>{
  const a=device(),b=device(),f=fixture();a.activate();writeAccountPreference('map-layer:one',{id:'one'});
  await syncPreferenceRecords(f.store(a));await syncPreferenceRecords(f.store(b));
  b.activate();writeAccountPreference('map-layer:one',null);await syncPreferenceRecords(f.store(b));await syncPreferenceRecords(f.store(a));
  a.activate();assert.equal(readAccountPreference('map-layer:one'),null);
});
test('account switch interrupts sync before acknowledgment',async()=>{
  const d=device(),f=fixture();d.activate();writeAccountPreference('north-reference','true');let switched=false;
  const s=f.store(d);
  await assert.rejects(syncPreferenceRecords({...s,check:()=>{if(switched)throw Error('account changed');d.activate();},put:async e=>{await s.put(e);switched=true;}}),/account changed/);
  d.activate();assert.equal(loadAccountPreferences()[0].pending,true);
});
test('invalid cloud revision cannot overwrite local settings',async()=>{
  const d=device(),f=fixture();d.activate();writeAccountPreference('north-reference','true');
  await assert.rejects(syncPreferenceRecords({...f.store(d),list:async()=>[{updatedAt:1,value:'bad'} as AccountPreference]}));
  d.activate();assert.equal(readAccountPreference('north-reference'),'true');assert.equal(loadAccountPreferences()[0].pending,true);
});
test('malformed legacy defaults preserve original bytes and fail visibly',()=>{
  const d=device();d.activate();d.values.set('geofield_custom_param_templates','broken JSON');
  assert.throws(initializeAccountPreferences,/preserved/);assert.equal(d.values.get('geofield_custom_param_templates'),'broken JSON');
});
