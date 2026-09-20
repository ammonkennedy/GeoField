import assert from "node:assert/strict";
import { test } from "node:test";
import { captureAccountAuthorization } from "../src/account-authorization.ts";
const session = (id: string) => ({tokens:{accessToken:{payload:{sub:id},toString:()=>`test-token-${id}`}}});
test("request credentials remain bound to the original account after a switch", async () => {
 let current="a";const options=await captureAccountAuthorization("a",async()=>session(current),async()=>false);current="b";
 assert.equal(options.authMode,"userPool");assert.equal(options.authToken,"test-token-a");
});
test("a session refresh returning another account cannot authorize the queued write", async () => {
 await assert.rejects(captureAccountAuthorization("a",async()=>session("b"),async()=>false),/Account changed/);
});
test("logout during token loading prevents authorization", async () => {
 let signedOut=false;
 await assert.rejects(captureAccountAuthorization("a",async()=>{signedOut=true;return session("a");},async()=>signedOut),/Account changed/);
});
test("missing or expired session data never falls back to anonymous authorization", async () => {
 await assert.rejects(captureAccountAuthorization("a",async()=>({}),async()=>false),/Account changed/);
});
