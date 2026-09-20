import assert from "node:assert/strict";
import { test } from "node:test";
import { isRetryableSyncError, syncRetryDelay } from "../src/lib/sync-retry.ts";

test("temporary connection and AWS failures are retryable", () => {
  for (const error of [
    { name: "NetworkError" },
    { name: "TimeoutError" },
    { message: "Load failed" },
    { message: "Failed to fetch" },
    {
      message:
        "Cloud sync is waiting for a connection to AWS. Your local data is still available.",
    },
    { name: "ThrottlingException" },
    { status: 429 },
    { $metadata: { httpStatusCode: 503 } },
  ])
    assert.equal(isRetryableSyncError(error), true, JSON.stringify(error));
});

test("invalid records and credentials do not trigger an endless retry loop", () => {
  for (const error of [
    { name: "CloudSignInRequired", message: "Network credentials expired" },
    { name: "NotAuthorizedException" },
    { status: 400 },
    { status: 403 },
    { message: "Variable 'orientationQuaternion' has an invalid value" },
  ])
    assert.equal(isRetryableSyncError(error), false, JSON.stringify(error));
});

test("retry delays back off, vary across devices, and remain capped", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 20].map((attempt) => syncRetryDelay(attempt, () => 1)),
    [5000, 10000, 20000, 40000, 80000, 120000, 120000],
  );
  assert.equal(
    syncRetryDelay(0, () => 0),
    4000,
  );
  assert.equal(
    syncRetryDelay(99, () => 0),
    96000,
  );
});
test("batch failures preserve retryable network errors but stop retrying when reauthentication is needed", async () => {
 const { requiresCloudSignIn } = await import("../src/lib/sync-retry.ts");
 assert.equal(isRetryableSyncError(new AggregateError([new Error("invalid record"),{name:"NetworkError"}],"Some changes remain pending")),true);
 const expired=Object.assign(new Error("Reconnect account"),{name:"CloudSignInRequired"});
 const mixed=new AggregateError([expired,{name:"NetworkError"}],"Some changes remain pending");
 assert.equal(requiresCloudSignIn(mixed),true);assert.equal(isRetryableSyncError(mixed),false);
});
