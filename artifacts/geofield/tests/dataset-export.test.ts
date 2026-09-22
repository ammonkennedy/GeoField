import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { buildDatasetWorkbook } from '../src/lib/export.ts';
import { DEFAULT_FORMAT_CONFIG, STRIKE_DIP_COLUMNS, buildStyledWorksheet, strikeDipToDataRow } from '../src/lib/export-config.ts';

const options = {
  samples: [], measurements: [{ id: 'm', label: 'Lineation A', measurementType: 'lineation' as const, trendDegrees: 123, plungeDegrees: 28, strike: '', dip: '', dipDir: '', location: '', date: '', featureType: '', rockLayerType: '', notes: '' }],
  datasets: [], folderName: 'Test', filename: 'test', sampleColumnsByType: {}, sampleConfig: DEFAULT_FORMAT_CONFIG,
  measurementColumns: [{ key: 'plunge', label: 'My plunge', enabled: true }, { key: 'label', label: 'Name', enabled: true }, { key: 'azimuth', label: 'Hidden', enabled: false }],
};

test('measurement-only workbook preserves column order, labels, and visibility through XLSX round trip', () => {
  const workbook = buildDatasetWorkbook(options)!;
  const saved = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  assert.deepEqual(saved.SheetNames, ['Measurements']);
  assert.deepEqual(XLSX.utils.sheet_to_json(saved.Sheets.Measurements, { header: 1 }), [['My plunge', 'Name'], [28, 'Lineation A']]);
});

test('measurement custom rows and transposed layout are applied', () => {
  const workbook = buildDatasetWorkbook({ ...options, sampleConfig: { ...DEFAULT_FORMAT_CONFIG, orientation: 'transposed' }, measurementCustomRows: [{ id: 'note', text: 'Field notes' }] })!;
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Measurements, { header: 1 });
  assert.ok(JSON.stringify(rows).includes('Field notes'));
  assert.ok(JSON.stringify(rows).includes('["My plunge",28]'));
});

test('mixed dataset includes both sample and measurement sheets', () => {
  const workbook = buildDatasetWorkbook({ ...options, samples: [{ id: 1, sampleType: 'rock', sampleId: 'Rock A', createdAt: '2026-09-22T12:00:00Z', fields: {} } as any] })!;
  assert.deepEqual(workbook.SheetNames, ['Rock', 'Measurements']);
});


for (const orientation of ['normal', 'transposed'] as const) {
  test(`custom rock and feature text survives both export paths in ${orientation} layout`, () => {
    const measurements = [
      { ...options.measurements[0], id: 'plane', label: 'Plane A', measurementType: 'plane' as const, rockLayerType: 'Garnet–mica schist / layer 2', featureType: 'C–S shear fabric' },
      { ...options.measurements[0], id: 'line', label: 'Line B', rockLayerType: 'Quartz vein, “A”', featureType: 'Custom mineral alignment' },
    ];
    // Reorder and rename headings to verify values follow field keys, not positions.
    const columns = ['featureType', 'rockLayerType'].map(key => ({ ...STRIKE_DIP_COLUMNS.find(column => column.key === key)!, label: key === 'featureType' ? 'My feature' : 'My rock' }));
    const config = { ...DEFAULT_FORMAT_CONFIG, orientation };
    const dataset = buildDatasetWorkbook({ ...options, measurements, measurementColumns: columns, sampleConfig: config })!;
    const direct = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(direct, buildStyledWorksheet(columns, measurements.map((measurement, index) => strikeDipToDataRow(measurement, index, 'Test')), config), 'Measurements');
    const expected = orientation === 'normal'
      ? [['My feature', 'My rock'], ...measurements.map(measurement => [measurement.featureType, measurement.rockLayerType])]
      : [['Parameter', 'Plane A', 'Line B'], ['My feature', ...measurements.map(measurement => measurement.featureType)], ['My rock', ...measurements.map(measurement => measurement.rockLayerType)]];
    for (const workbook of [dataset, direct]) {
      const saved = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
      assert.deepEqual(XLSX.utils.sheet_to_json(saved.Sheets.Measurements, { header: 1 }), expected);
    }
  });
}
