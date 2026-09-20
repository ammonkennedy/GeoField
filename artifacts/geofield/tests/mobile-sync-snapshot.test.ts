import assert from "node:assert/strict";
import { test } from "node:test";
import { retainConcurrentEdits } from "../../geofield-mobile/lib/sync-snapshot.ts";
const before = [{ id: "one", notes: "Original" }];
test("native sync keeps edits and additions made while requests were running", () => {
 const current=[{id:"one",notes:"New text"},{id:"two",notes:"New record"}];
 assert.deepEqual(retainConcurrentEdits(current,before,[{id:"one",notes:"Old response"}]),current);
});
test("native sync cannot resurrect a locally deleted record", () => {
 assert.deepEqual(retainConcurrentEdits([],before,before),[]);
});
test("native sync applies a confirmed deletion only to an unchanged local record", () => {
 assert.deepEqual(retainConcurrentEdits(before,before,[]),[]);
 const current=[{id:"one",notes:"Unsaved to cloud"}];
 assert.deepEqual(retainConcurrentEdits(current,before,[]),current);
});
