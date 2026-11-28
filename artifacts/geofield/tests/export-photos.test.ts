import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx/xlsx.mjs';
import { serializeWorkbookPhotos } from '../src/lib/export-photo-workbook.ts';
import { buildDatasetWorkbook } from '../src/lib/export.ts';
import { DEFAULT_FORMAT_CONFIG, getSampleColumns } from '../src/lib/export-config.ts';
import { samplePhotoAttachments, collectSampleWorkbookPhotos } from '../src/lib/export-photos.ts';
const sample:any={id:'one',sampleId:'W-1',sampleType:'water',notes:'Clear water\nCollected upstream',createdAt:'2026-11-26T10:00:00Z',folderId:'project',fields:{ph:0,turbidity:2,rockType:'Granite',hardness:3,otherSampleTitle:'Old title',horizon:'',customParams:[{label:'Custom water value',value:42}]}};
const options={samples:[sample],measurements:[],datasets:[{id:'project',name:'Ecuador'}],folderName:'Ecuador',filename:'test',sampleColumnsByType:{},sampleConfig:DEFAULT_FORMAT_CONFIG};
for(const orientation of ['normal','transposed'] as const) {
  test(`water-only export excludes other sample types and retains notes in ${orientation} layout`,()=>{
    const columns=getSampleColumns([sample]);
    assert.equal(columns.some(c=>['field_rockType','field_hardness','field_otherSampleTitle','field_horizon'].includes(c.key)),false);
    const workbook=buildDatasetWorkbook({...options,sampleConfig:{...DEFAULT_FORMAT_CONFIG,orientation},sampleColumnsByType:{water:[...columns.map(c=>c.key==='_notes'?{...c,enabled:false}:c),{key:'field_rockType',label:'Stale rock column',enabled:true}]}})!;
    const result=XLSX.read(XLSX.write(workbook,{type:'array',bookType:'xlsx'}),{type:'array'});
    assert.deepEqual(result.SheetNames,['Water','Sample Notes']);
    const water=JSON.stringify(XLSX.utils.sheet_to_json(result.Sheets.Water,{header:1}));
    assert.equal(water.includes('Stale rock column'),false);assert.ok(water.includes('Custom water value'));assert.ok(water.includes('0'));
    const notes=XLSX.utils.sheet_to_json(result.Sheets['Sample Notes'],{header:1}) as any[];
    assert.deepEqual(notes[1],['W-1','water','Ecuador',sample.notes]);
  });
}
test('embedded photo bytes, drawing relationships and sample captions survive XLSX packaging',()=>{
  const workbook=buildDatasetWorkbook(options)!;
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
  const output=serializeWorkbookPhotos(workbook,[{sample:'W-1 & <test>',project:'Ecuador',caption:'Upstream photograph',bytes:png,extension:'png',width:1,height:1}]);
  const zip=XLSX.CFB.read(output,{type:'array'});
  assert.deepEqual(new Uint8Array(XLSX.CFB.find(zip,'/xl/media/geofieldPhoto1.png').content),png);
  const xml=(path:string)=>new TextDecoder().decode(XLSX.CFB.find(zip,"/"+path).content);
  assert.match(xml('xl/worksheets/sheet3.xml'),/r:id="rIdGeoFieldPhotos"/);
  assert.match(xml('xl/drawings/geofieldPhotos.xml'),/W-1 &amp; &lt;test&gt;/);
  assert.match(xml('xl/drawings/_rels/geofieldPhotos.xml.rels'),/Target="..\/media\/geofieldPhoto1.png"/);
  assert.match(xml('[Content_Types].xml'),/ContentType="image\/png"/);
  const read=XLSX.read(output,{type:'array'});
  assert.ok(read.SheetNames.includes('Sample Photos'));
  assert.deepEqual((XLSX.utils.sheet_to_json(read.Sheets['Sample Photos'],{header:1}) as any[])[1],['W-1 & <test>','Ecuador','Upstream photograph','']);
});
test('selects all photos, excludes videos, supports legacy images without duplicate primary photo',()=>{
  const a={kind:'photo',storageKey:'photo1'},b={type:'photo',dataUrl:'data:image/png;base64,test'};
  assert.deepEqual(samplePhotoAttachments({...sample,fields:{media:[a,{kind:'video'},b],primaryPhoto:a}}),[a,b]);
  assert.deepEqual(samplePhotoAttachments({...sample,fields:{photo:'legacy',photoCaption:'caption'}}),[{dataUrl:'legacy',caption:'caption'}]);
});
test('mixed sample types get only their own parameters, while shared fields and zero values survive',()=>{
  const fields={rockType:'Basalt',ph:0,horizon:'A',pidReading:2,otherSampleTitle:'Other title',elevation:0,customParams:[{label:'User parameter',value:false}]};
  const expected:Record<string,string[]>={water:['ph'],rock:['rockType'],soil_sand:['ph','horizon'],air:['pidReading'],other:[]};
  for(const [type,keys] of Object.entries(expected)) {
    const columns=getSampleColumns([{...sample,sampleType:type,fields}]);
    for(const field of ['rockType','ph','horizon','pidReading','otherSampleTitle']) assert.equal(columns.some(c=>c.key===`field_${field}`),keys.includes(field),`${type}: ${field}`);
    assert.ok(columns.some(c=>c.key==='field_elevation'));
    assert.ok(columns.some(c=>c.label==='User parameter'));
  }
});
test('legacy field notes are included without exporting duplicate parameter columns',()=>{
  const old={...sample,notes:'',fields:{fieldNotes:'Legacy observation'}};
  const workbook=buildDatasetWorkbook({...options,samples:[old]})!;
  assert.equal(getSampleColumns([old]).some(c=>c.key==='field_fieldNotes'),false);
  assert.match(JSON.stringify(XLSX.utils.sheet_to_json(workbook.Sheets['Sample Notes'])),/Legacy observation/);
});
test('an explicitly cleared media list does not resurrect a legacy photo',()=>{
  assert.deepEqual(samplePhotoAttachments({...sample,fields:{media:[],photo:'old-photo',primaryPhoto:{kind:'photo'}}}),[]);
});

test('unavailable photos fail export visibly instead of producing an incomplete workbook',async()=>{
  await assert.rejects(collectSampleWorkbookPhotos([{...sample,fields:{media:[{kind:'photo'}]}}],options.datasets,'Ecuador',async()=>{throw Error('Offline photo unavailable');},()=>{}),/W-1.*No incomplete workbook was saved/);
});
test('account changes during photo loading stop export',async()=>{
  let changed=false;
  await assert.rejects(collectSampleWorkbookPhotos([{...sample,fields:{media:[{kind:'photo'}]}}],options.datasets,'Ecuador',async()=>{changed=true;return {bytes:new Uint8Array(),extension:'png',width:1,height:1};},()=>{if(changed)throw Error('Account changed');}),/Account changed/);
});
test('export contains only sheet parameters, never internal metadata or duplicate coordinates',()=>{
  const record={...sample,fields:{ph:7,location:'1, 2',collectionDate:'2026-11-26T14:40',altitude:0,latitude:1,longitude:2,gpsAccuracy:3,elevationAccuracy:4,plannedSiteId:'internal',collectionStatus:'collected',collectedAt:'internal time',unknownLegacyField:'old',strike:40,dip:20,customParams:[{label:'My observation',value:'Keep'}]}};
  const columns=getSampleColumns([record]);
  assert.deepEqual(columns.map(c=>c.key),['_sampleId','_sampleType','_folder','_notes','field_ph','field_location','field_collectionDate','field_elevation','_customParameter:my observation:0']);
  const workbook=buildDatasetWorkbook({...options,samples:[record]})!;
  const rows=XLSX.utils.sheet_to_json(workbook.Sheets.Water,{header:1}) as any[];
  assert.equal(rows[1][7],0);
  assert.equal(JSON.stringify(rows).includes('internal'),false);
});
for (const orientation of ['normal','transposed'] as const) {
  test(`equivalent historical parameter names share one populated workbook column in ${orientation} layout`,()=>{
    const samples = ['Pressure mm/hg','Pressure','Barometric Pressure (mmHg)'].map((label,index)=>({...sample,sampleId:`Water-${index}`,fields:{customParams:[{label,value:449+index},{label:'Barometric pressure (mmHg)',value:''}]}}));
    const workbook=buildDatasetWorkbook({...options,samples,sampleConfig:{...DEFAULT_FORMAT_CONFIG,orientation}})!;
    const saved=XLSX.read(XLSX.write(workbook,{type:'array',bookType:'xlsx'}),{type:'array'});
    const rows=XLSX.utils.sheet_to_json(saved.Sheets.Water,{header:1}) as any[][];
    if(orientation==='normal') {
      assert.equal(rows[0].length,5);
      assert.deepEqual(rows.slice(1).map(row=>row[4]),[449,450,451]);
    } else {
      assert.equal(rows.length,6);
      assert.deepEqual(rows[5].slice(1),[449,450,451]);
    }
  });
}
