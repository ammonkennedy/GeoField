import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readEditHistory, withEditHistory } from '../src/lib/photo-edit-history.ts';
import { photoWithOriginal, originalFromPhoto } from '../src/lib/photo-versions.ts';
const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
test('saved strokes and original survive transfer and subsequent undo to zero strokes', () => {
  const history = {width:600,height:400,strokes:[{color:'#ff0000',width:4,points:[{x:10,y:20},{x:100,y:20}]}]};
  const saved = photoWithOriginal(withEditHistory(jpeg,history),jpeg);
  assert.deepEqual(readEditHistory(saved),history);
  assert.equal(originalFromPhoto(saved),jpeg);
  const undone = photoWithOriginal(withEditHistory(jpeg,{...history,strokes:[]}),saved);
  assert.equal(readEditHistory(undone)?.strokes.length,0);
  assert.equal(originalFromPhoto(undone),jpeg);
});
test('history supports multiple metadata segments and legacy flattened base', () => {
  const history = {width:600,height:400,legacyBase:jpeg,strokes:[{color:'#00ff00',width:4,points:Array.from({length:10000},(_,i)=>({x:i%600,y:i%400}))}]};
  assert.deepEqual(readEditHistory(withEditHistory(jpeg,history)),history);
});
