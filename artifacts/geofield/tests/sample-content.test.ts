import assert from "node:assert/strict";
import { test } from "node:test";
import { sameSampleContent, sampleRecoveryId } from "../src/lib/sample-content.ts";
const sample = (url: string, localKey: string) => ({sampleId:"Rock",sampleType:"rock",notes:"Keep",fields:{elevation:100,media:[{kind:"photo",storageKey:"media/a/photo",cloudUrl:url,localKey}],primaryPhoto:{cloudUrl:url}}});
test("signed URL refresh and offline cache paths are not sample edits", () => {
  assert.ok(sameSampleContent(sample("old", "device-a"), sample("new", "device-b")));
  assert.equal(sameSampleContent(sample("old", "a"), {...sample("new", "b"), notes:"Changed"}),false);
  const changed=sample("new","b");changed.fields.media[0].storageKey="media/a/different";
  assert.equal(sameSampleContent(sample("old", "a"),changed),false);
});
test("recovery IDs are stable across retries and URL refreshes but distinguish edits", async () => {
  const first=await sampleRecoveryId("id",sample("old","a"));
  assert.equal(first,await sampleRecoveryId("id",sample("new","b")));
  assert.notEqual(first,await sampleRecoveryId("id",{...sample("old","a"),notes:"Different"}));
});
