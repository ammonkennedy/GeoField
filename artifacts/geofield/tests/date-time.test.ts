import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTime24, localDateTimeValue } from '../src/lib/date-time.ts';

test('existing morning, afternoon and midnight records display 24-hour times', () => {
  for (const [value, expected] of [['2026-11-22T14:40', '14:40'], ['2026-11-22T00:05', '00:05'], ['2026-11-22T09:05', '09:05']]) {
    const result = formatDateTime24(value);
    assert.ok(result.includes(expected), result);
    assert.doesNotMatch(result, /AM|PM/i);
  }
});
test('editing local collection time preserves the local date and existing seconds', () => {
  assert.equal(localDateTimeValue('2026-11-22T14:40:25'), '2026-11-22T14:40:25');
  assert.equal(localDateTimeValue(''), '');
  assert.equal(localDateTimeValue('bad'), '');
  const iso = '2026-11-22T19:40:00Z';
  const local = localDateTimeValue(iso);
  assert.equal(new Date(local).getTime(), new Date(iso).getTime());
});
