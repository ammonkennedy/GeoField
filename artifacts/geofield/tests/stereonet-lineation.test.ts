import test from 'node:test';
import assert from 'node:assert/strict';
import { calibratedLineation, flipLineationDirection, lineationOrientationFromVector } from '../src/lib/strike-dip-math.ts';
import { importMeasurement, measurementVector, normalizedMeasurement, newGroup, newStereonet, repairImportedPlanes } from '../src/lib/stereonet/model.ts';
import { project } from '../src/lib/stereonet/math.ts';
import { normalizeLineationRecord } from '../src/lib/lineation-record.ts';
import type { StrikeDipMeasurement } from '../src/lib/strike-dip-measurements.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const source=(trend:number,plunge:number,featureType='lineation'):StrikeDipMeasurement=>({id:'line',measurementType:'lineation',label:'Line',featureType,trendDegrees:trend,plungeDegrees:plunge,northReference:'magnetic',strike:'',dip:'',dipDir:'',location:'',date:'2026-10-22',rockLayerType:'',notes:''});
for(const feature of ['lineation','fold axis','intersection lineation','slickenline','Custom linear feature']){
 test(`${feature}: import preserves trend/plunge and ignores unrelated plane/vector fields`,()=>{
  const m=importMeasurement({...source(90,30,feature),strikeDegrees:270,dipDirectionDegrees:180,lineVector:{east:-1,north:0,up:0}},'g');
  assert.equal(m.azimuth,90);assert.equal(m.inclination,30);
  const [x,y]=project(measurementVector(m));close(x,Math.SQRT1_2);close(y,0);
 });
}
test('horizontal cardinal lineations and vertical plunge project at known positions',()=>{
 for(const [t,x,y] of [[0,0,-1],[90,1,0],[180,0,1],[270,-1,0]]){
  const position=project(measurementVector(importMeasurement(source(t,0),'g')));close(position[0],x);close(position[1],y);
 }
 const center=project(measurementVector(importMeasurement(source(137,90),'g')));assert.deepEqual(center,[0,0]);
});
test('sensor-to-import path applies calibration once without reversing down-plunge trend',()=>{
 const orientation=lineationOrientationFromVector({east:1,north:0,up:-1})!;
 const adjusted=calibratedLineation(orientation)!;
 const m=importMeasurement({...source(adjusted.trend,adjusted.plunge),lineVector:adjusted.vector},'g');
 close(m.azimuth,100);close(m.inclination,45);
 const radius=Math.sqrt(1-Math.sin(Math.PI/4));
 const [x,y]=project(measurementVector(m));close(x,radius*Math.sin(100*Math.PI/180));close(y,-radius*Math.cos(100*Math.PI/180));
});
test('upward sensor vector selects lower hemisphere; explicit user flip is retained exactly once',()=>{
 const orientation=lineationOrientationFromVector({east:-1,north:0,up:1})!;
 close(orientation.trend,90);close(orientation.plunge,45);
 const flipped=calibratedLineation(flipLineationDirection(orientation))!;
 const m=importMeasurement(source(flipped.trend,flipped.plunge),'g');close(m.azimuth,280);close(m.inclination,45);
 assert.ok(project(measurementVector(m))[0]<0);
});
test('legacy lineation recovery and plane repair never rotate a line',()=>{
 const legacy=normalizeLineationRecord({...source(0,0),trendDegrees:undefined,plungeDegrees:undefined,label:'Lineation 090°/30°'});
 const net=newStereonet('Lines');net.measurements=[importMeasurement(legacy,net.groups[0].id)];
 assert.equal(net.measurements[0].azimuth,90);assert.equal(net.measurements[0].inclination,30);assert.equal(repairImportedPlanes(net),net);
});
test('north conversion wraps trend, preserves plunge and leaves original unchanged',()=>{
 const m=importMeasurement({...source(355,30),magneticDeclination:12},'g');
 const adjusted=normalizedMeasurement(m,newGroup(),'true');close(adjusted.azimuth,7);close(adjusted.inclination,30);close(m.azimuth,355);
});
