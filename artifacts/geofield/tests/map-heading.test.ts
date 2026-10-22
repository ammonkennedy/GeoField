import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserHeading, relativeHeading, validHeading } from '../src/lib/map-heading.ts';

test('compass rejects missing, invalid and unreliable readings', () => {
 for (const value of [undefined, null, NaN, Infinity, -1]) assert.equal(validHeading(value), null);
 assert.equal(validHeading(25, -1), null);
 assert.equal(validHeading(25, 80), null);
 assert.equal(validHeading(0, 5), 0);
 assert.equal(validHeading(360), 0);
});
test('browser compass supports iOS and absolute orientation, but never guesses relative north', () => {
 assert.equal(browserHeading({ webkitCompassHeading: 90, webkitCompassAccuracy: 5, alpha: null }), 90);
 assert.equal(browserHeading({ absolute: true, alpha: 270 }), 90);
 assert.equal(browserHeading({ absolute: false, alpha: 270 }), null);
 assert.equal(browserHeading({ absolute: true, alpha: null }), null);
 assert.equal(browserHeading({ absolute: true, alpha: 270 }, 90), 180);
});
test('fan stays oriented to the real heading as the map rotates', () => {
 assert.equal(relativeHeading(90, 0), 90);
 assert.equal(relativeHeading(90, 90), 0);
 assert.equal(relativeHeading(0, 90), 270);
 assert.equal(relativeHeading(350, -10), 0);
});
