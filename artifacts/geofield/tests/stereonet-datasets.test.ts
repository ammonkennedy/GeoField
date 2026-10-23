import test from 'node:test';
import assert from 'node:assert/strict';
import {importMeasurementDatasets,compatibleReference} from '../src/lib/stereonet/dataset-import.ts';
import {newStereonet,plottedMeasurements,importMeasurement} from '../src/lib/stereonet/model.ts';
import type {StrikeDipMeasurement} from '../src/lib/strike-dip-measurements.ts';
const record=(id:string,datasetId:string|number,northReference:'true'|'magnetic'='true'):StrikeDipMeasurement=>({id,datasetId,northReference,label:id,strike:'20',dip:'40',strikeDegrees:20,dipDegrees:40,dipDir:'',notes:'',location:'',date:'2026-10-22',featureType:'bedding',rockLayerType:''});
test('selected datasets plot directly under named groups without requiring conversion for true-north data',()=>{
 const n=importMeasurementDatasets(newStereonet('Test'),[record('a',1),record('b',2)],[{id:1,name:'Bedding'},{id:2,name:'Faults'}],[],['1']);
 assert.equal(n.measurements.length,1);assert.equal(n.groups[0].name,'Bedding');assert.equal(n.north,'true');assert.equal(plottedMeasurements(n).errors.length,0);
});
test('select all includes uncategorized, preserves groups and avoids duplicate imports across local/cloud dataset aliases',()=>{
 const identities=[{id:-1,cloudId:'cloud',name:'Trip'}];
 const records=[record('a',-1),record('b','')];
 const n=importMeasurementDatasets(newStereonet('Test'),records,identities,identities,'all');
 const again=importMeasurementDatasets(n,[record('a','cloud'),record('b','')],identities,identities,'all');
 assert.equal(again.measurements.length,2);assert.equal(again.groups.length,2);assert.equal(again.groups[1].name,'Uncategorized');
});
test('mixed references are not silently combined; compatible reference uses known corrections',()=>{
 const n=importMeasurementDatasets(newStereonet('Test'),[record('a',1),record('b',2,'magnetic')],[],[],'all');
 assert.equal(plottedMeasurements(n).errors.length,1);
 const withCorrection=importMeasurementDatasets(newStereonet('Test'),[{...record('a',1),magneticDeclination:12},record('b',2,'magnetic')],[],[],'all');
 assert.equal(plottedMeasurements(withCorrection).errors.length,0);
});
test('existing true-north imports offer a reference correction without changing raw azimuth',()=>{
 const n=newStereonet('Existing');n.measurements=[importMeasurement(record('a',1),n.groups[0].id)];
 assert.equal(compatibleReference(n),'true');assert.equal(n.measurements[0].azimuth,20);
});
