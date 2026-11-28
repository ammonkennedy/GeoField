import assert from "node:assert/strict";
import test from "node:test";
import type { Sample } from "@workspace/api-client-react";
import { getSampleColumns, sampleToDataRow } from "./export-config.ts";

function sample(id: string, customParams: Array<{ label: string; value: unknown }>): Sample {
  return {
    id,
    sampleId: id,
    sampleType: "rock",
    userId: "test-user",
    folderId: null,
    notes: "",
    fields: { customParams },
    createdAt: "2026-07-31T12:00:00.000Z",
    updatedAt: "2026-07-31T12:00:00.000Z",
  };
}

test("exports custom parameter labels as columns and values as cells", () => {
  const first = sample("R-1", [
    { label: "Fracture spacing", value: "12 cm" },
    { label: "Weathering grade", value: 3 },
  ]);
  const second = sample("R-2", [
    { label: "Fracture spacing", value: "18 cm" },
  ]);

  const columns = getSampleColumns([first, second]);
  const customColumns = columns.filter((column) =>
    ["Fracture spacing", "Weathering grade"].includes(column.label)
  );
  assert.deepEqual(customColumns.map((column) => column.label), [
    "Fracture spacing",
    "Weathering grade",
  ]);
  assert.equal(columns.some((column) => column.label === "custom Params"), false);

  const firstRow = sampleToDataRow(first, "Outcrop A");
  const secondRow = sampleToDataRow(second, "Outcrop A");
  const fractureColumn = customColumns.find((column) => column.label === "Fracture spacing")!;
  const weatheringColumn = customColumns.find((column) => column.label === "Weathering grade")!;

  assert.equal(firstRow[fractureColumn.key], "12 cm");
  assert.equal(firstRow[weatheringColumn.key], 3);
  assert.equal(secondRow[fractureColumn.key], "18 cm");
  assert.equal(secondRow[weatheringColumn.key], undefined);
});

test("keeps repeated custom parameter names in separate columns", () => {
  const record = sample("R-3", [
    { label: "Reading", value: 10 },
    { label: "Reading", value: 20 },
  ]);
  const columns = getSampleColumns([record]).filter((column) => column.label.startsWith("Reading"));
  const row = sampleToDataRow(record, "Outcrop B");

  assert.equal(columns.length, 2);
  assert.deepEqual(columns.map((column) => row[column.key]), [10, 20]);
});

test("supports legacy serialized custom parameters without object-string cells", () => {
  const record = sample("R-4", []) as Sample;
  record.fields = {
    customParams: JSON.stringify([
      { label: "Joint spacing", value: "8 cm" },
      { label: "Minerals", value: ["quartz", "feldspar"] },
    ]),
    primaryPhoto: { storageKey: "photo-1" },
    photoCount: 1,
    videoCount: 2,
  };

  const columns = getSampleColumns([record]);
  const row = sampleToDataRow(record, "Outcrop C");
  const jointSpacing = columns.find((column) => column.label === "Joint spacing")!;
  const minerals = columns.find((column) => column.label === "Minerals")!;

  assert.equal(columns.some((column) => column.label === "custom Params"), false);
  assert.equal(row[jointSpacing.key], "8 cm");
  assert.equal(row[minerals.key], '["quartz","feldspar"]');
  assert.equal(columns.some((column) => ["primary Photo", "photo Count", "video Count"].includes(column.label)), false);
  assert.equal(row.field_primaryPhoto, undefined);
  assert.equal(row.field_photoCount, undefined);
  assert.equal(row.field_videoCount, undefined);
});

test('equivalent custom labels align values across samples without fabricating missing readings', () => {
  const records = [
    sample('A', [{label:'Specific conductance',value:5.4},{label:'Pressure mm/hg',value:449},{label:'Dissolved oxygen %',value:48.9}]),
    sample('B', [{label:'Specific Conductance (SPC)',value:3.6},{label:'Barometric Pressure (mmHg)',value:501.9},{label:'Dissolved Oxygen (%)',value:64.2}]),
    sample('C', [{label:'specific  conductance (SPC)',value:0}]),
  ];
  const columns = getSampleColumns(records).filter(c=>c.key.startsWith('_customParameter:'));
  assert.equal(columns.length,3);
  const rows = records.map(s=>sampleToDataRow(s,'Test'));
  assert.deepEqual(columns.map(c=>rows[0][c.key]),[5.4,449,48.9]);
  assert.deepEqual(columns.map(c=>rows[1][c.key]),[3.6,501.9,64.2]);
  assert.deepEqual(columns.map(c=>rows[2][c.key]),[0,undefined,undefined]);
});
test('empty duplicate template entries do not hide readings; distinct values remain separate',()=>{
  const record=sample('A',[{label:'Reading',value:''},{label:' reading ',value:0},{label:'READING',value:''},{label:'Reading',value:12}]);
  const columns=getSampleColumns([record]).filter(c=>c.key.startsWith('_customParameter:'));
  const row=sampleToDataRow(record,'Test');
  assert.equal(columns.length,2);
  assert.deepEqual(columns.map(c=>row[c.key]),[0,12]);
  assert.match(columns[1].label,/reading 2/);
});
test('different units and unqualified pressure remain separate',()=>{
  const record=sample('A',[{label:'Pressure',value:5},{label:'Pressure (mmHg)',value:449},{label:'Pressure (kPa)',value:60},{label:'Dissolved Oxygen (%)',value:50},{label:'Dissolved Oxygen (mg/L)',value:4}]);
  assert.equal(getSampleColumns([record]).filter(c=>c.key.startsWith('_customParameter:')).length,5);
});
test('confirmed unitless water pressure aliases use the same mmHg export column',()=>{
  const records=['Pressure','Pressure mm Hg','Barometric Pressure mmHg'].map((label,i)=>({...sample(String(i),[{label,value:449+i}]),sampleType:'water' as const}));
  const columns=getSampleColumns(records).filter(c=>c.key.startsWith('_customParameter:'));
  assert.equal(columns.length,1);
  assert.deepEqual(records.map(record=>sampleToDataRow(record,'Test')[columns[0].key]),[449,450,451]);
});
