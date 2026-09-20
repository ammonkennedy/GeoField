import assert from "node:assert/strict";
import { test } from "node:test";
import { removeAccountLocalData, getStorageAccountId, assertStorageAccount } from "../src/lib/storage-account.ts";
import { readDurableArray, writeDurableArray } from "../src/lib/durable-storage.ts";

function setup() {
  const values = new Map<string,string>();
  let fail = "";
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    get length() { return values.size; }, key: (i:number) => [...values.keys()][i] ?? null,
    removeItem: (key:string) => values.delete(key),
    getItem: (key:string) => values.get(key) ?? null,
    setItem: (key:string,value:string) => { if (key === fail) throw new Error("full"); values.set(key,value); },
  }});
  return { values, fail: (key:string) => { fail = key; } };
}
test("corrupt primary recovers even when repair cannot be written", () => {
  const s = setup(); s.values.set("items", "broken"); s.values.set("items__backup", '[{"id":1}]'); s.fail("items");
  assert.deepEqual(readDurableArray("items"), [{id:1}]);
});
test("both copies corrupt blocks overwrite and preserves original bytes", () => {
  const s = setup(); s.values.set("items", "broken"); s.values.set("items__backup", "also broken");
  assert.throws(() => writeDurableArray("items", []), /preserved/);
  assert.equal(s.values.get("items"), "broken");
});
test("failed primary write keeps the last committed collection recoverable", () => {
  const s = setup(); writeDurableArray("items", [{id:1}]); s.fail("items");
  assert.throws(() => writeDurableArray("items", [{id:2}]));
  s.values.set("items", "broken"); assert.deepEqual(readDurableArray("items"), [{id:1}]);
});
test("legacy data belongs to one account and survives logout and account switching", () => {
  const s = setup(); s.values.set("geofield_strike_dip", '[{"id":"original"}]');
  s.values.set("geofield-account:pool", JSON.stringify({user:{id:"a"}}));
  assert.deepEqual(readDurableArray("geofield_strike_dip"), [{id:"original"}]);
  s.values.set("geofield-account:pool", JSON.stringify({signedOut:true}));
  assert.deepEqual(readDurableArray("geofield_strike_dip"), []);
  s.values.set("geofield-account:pool", JSON.stringify({user:{id:"b"}}));
  assert.deepEqual(readDurableArray("geofield_strike_dip"), []);
  writeDurableArray("geofield_strike_dip", [{id:"b-note"}]);
  s.values.set("geofield-account:pool", JSON.stringify({user:{id:"a"}}));
  assert.deepEqual(readDurableArray("geofield_strike_dip"), [{id:"original"}]);
  assert.equal(s.values.get("geofield_strike_dip"), '[{"id":"original"}]');
});

test("deleting one account leaves the other account's notes and samples intact", () => {
 const s=setup();s.values.set("geofield_offline_queue:account:a", "[1]");s.values.set("geofield_offline_queue:account:b", "[2]");s.values.set("geofield_field_notes:b", "[3]");
 removeAccountLocalData("a");assert.equal(s.values.has("geofield_offline_queue:account:a"),false);assert.equal(s.values.get("geofield_offline_queue:account:b"),"[2]");assert.equal(s.values.get("geofield_field_notes:b"),"[3]");
});

test("multiple saved auth pools cannot select an arbitrary account", () => {
 const s=setup();s.values.set("geofield-account:staging",JSON.stringify({user:{id:"staging-user"}}));s.values.set("geofield-account:production",JSON.stringify({user:{id:"production-user"}}));
 assert.equal(getStorageAccountId(),null);s.values.set("geofield-active-account-profile","geofield-account:production");assert.equal(getStorageAccountId(),"production-user");
});

test("async saves refuse a switched or logged-out storage account", () => {
  const s = setup();
  s.values.set("geofield-account:pool", JSON.stringify({user:{id:"a"}}));
  assert.doesNotThrow(() => assertStorageAccount("a"));
  s.values.set("geofield-account:pool", JSON.stringify({user:{id:"b"}}));
  assert.throws(() => assertStorageAccount("a"), /account changed/);
  s.values.set("geofield-account:pool", JSON.stringify({signedOut:true}));
  assert.throws(() => assertStorageAccount("a"), /account changed/);
});
