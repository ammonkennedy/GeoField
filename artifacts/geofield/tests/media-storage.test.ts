import { IDBFactory } from "fake-indexeddb";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as nativeMedia from '../src/lib/native-media.ts';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/media-storage.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(files = new Map<string,string>(), native = true) {
 const database = new IDBFactory();
 const state = { owner: 'owner', failWrite: false, corruptRead: false };
 const calls: string[] = [];
 const Filesystem = {
  writeFile: async ({path, data, directory}: any) => { calls.push(directory); if (state.failWrite) throw Error('disk full'); files.set(path, data); },
  readFile: async ({path}: any) => { if (!files.has(path)) throw Error('file does not exist'); return {data:state.corruptRead?'wrong':files.get(path)}; },
  rmdir: async ({path}: any) => { for(const key of files.keys()) if(key.startsWith(path+'/')) files.delete(key); },
 };
 const exports: any = {};
 vm.runInNewContext(compiled, { exports, crypto, atob, Uint8Array, Blob, console,
  FileReader: class {
   result = ''; onload = () => {}; onerror = () => {};
   readAsDataURL(blob: Blob) { blob.arrayBuffer().then(buffer => {this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;this.onload();}).catch(()=>this.onerror()); }
  },
  require: (name: string) => name === '@capacitor/core' ? {Capacitor:{isNativePlatform:()=>native}} : name === '@capacitor/filesystem' ? {Directory:{Data:'private-data'},Filesystem} : name.includes('native-media') ? nativeMedia : {
   getStorageAccountId:()=>state.owner, assertStorageAccount:(owner:string)=>{if(!owner||owner!==state.owner)throw Error('account changed');},
  },
  indexedDB: native ? {open:()=>{throw Error('Native media must not use browser quota');}} : database,
 });
 return { ...exports, files, state, calls, database };
}
const input = {kind:'photo',dataUrl:'data:image/jpeg;base64,AQIDBA==',fileName:'field.jpg'};
test('native photo and video bytes use private files and remain readable after reopening', async () => {
 const f = fixture();
 for (const kind of ['photo','video']) {
  const stored = await f.storeMediaDataUrl({...input,kind});
  assert.equal(stored.storage,'filesystem');
  assert.equal(stored.sizeBytes,4);
  assert.equal(f.files.get(nativeMedia.nativeMediaLocation(stored.storageKey)!.path),'AQIDBA==');
  assert.equal(await fixture(f.files).getStoredMediaDataUrl(stored.storageKey),input.dataUrl);
 }
 assert.deepEqual(f.calls,['private-data','private-data']);
});
test('full disk or read-back mismatch never acknowledges a saved attachment', async () => {
 const f=fixture();f.state.failWrite=true;
 await assert.rejects(f.storeMediaDataUrl(input),/disk full/);
 f.state.failWrite=false;f.state.corruptRead=true;
 await assert.rejects(f.storeMediaDataUrl(input),/verify/);
});
test('native account cleanup removes only that account files; missing local copies can download again', async () => {
 const f=fixture();const first=await f.storeMediaDataUrl(input);
 f.state.owner='second';const second=await f.storeMediaDataUrl(input);
 await f.removeAccountNativeMedia('owner');
 assert.equal(await f.getStoredMediaDataUrl(first.storageKey),null);
 assert.equal(await f.getStoredMediaDataUrl(second.storageKey),input.dataUrl);
});
test('media decoder preserves every byte and rejects invalid input', () => {
 const decoded=nativeMedia.mediaDataUrlBytes('data:video/mp4;base64,AP/+AA==');
 assert.deepEqual([...decoded.bytes],[0,255,254,0]);
 assert.throws(()=>nativeMedia.mediaDataUrlBytes('https://example.com/photo'),/could not be read/);
 assert.equal(nativeMedia.nativeMediaLocation('../../private'),null);
});

test('web binary media round-trips and legacy data URLs remain readable', async () => {
 const f=fixture(new Map(),false);
 const saved=await f.storeMediaDataUrl(input);
 assert.equal(saved.storage,'indexeddb');
 assert.equal(await f.getStoredMediaDataUrl(saved.storageKey),input.dataUrl);
 const db:any=await new Promise((resolve,reject)=>{const req=f.database.open('geofield_media_store',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').put({storageKey:'legacy',dataUrl:input.dataUrl});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
 db.close();
 assert.equal(await f.getStoredMediaDataUrl('legacy'),input.dataUrl);
 assert.equal(await f.getStoredMediaDataUrl('absent'),null);
});
