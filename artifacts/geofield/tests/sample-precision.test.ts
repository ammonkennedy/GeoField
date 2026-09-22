import assert from "node:assert/strict";
import { test } from "node:test";
import { findSamplePrecisionError } from "../src/lib/sample-precision.ts";
test("device GPS precision cannot block sample saving or change recorded values", () => {
  const fields = { location: "40.123456789, -111.123456789", latitude: 40.123456789, longitude: -111.123456789, elevation: 1452.123456789, elevationAccuracy: 3.141592653589793, gpsAccuracy: 4.123456789, utmEasting: 412345.123456789, altitude: 123.123456789, altitudeAccuracy: 2.123456789 };
  const original = structuredClone(fields);
  assert.equal(findSamplePrecisionError(fields, []), undefined);
  assert.deepEqual(fields, original);
});
test("actual sample precision errors identify the offending parameter", () => {
  assert.equal(findSamplePrecisionError({ elevation: 12.123456789, waterTemperature: "23.12345678" }, []), "water Temperature");
  assert.equal(findSamplePrecisionError({}, [{ label: "Dissolved oxygen", value: "8.12345678" }]), "Dissolved oxygen");
});
test("seven decimals, text, missing GPS, and unnamed unsaved custom fields remain allowed", () => {
  assert.equal(findSamplePrecisionError({ temperature: "12.1234567", description: "12.123456789 mg/L", elevation: null }, [{ label: "", value: "1.12345678" }]), undefined);
});
