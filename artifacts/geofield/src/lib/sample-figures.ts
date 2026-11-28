import { getCustomParameters } from "./custom-parameters.ts";
import { normalizedParameterLabel } from "./export-parameter-names.ts";

export const NUMERIC_PARAMS: Record<string, { label: string; unit: string; type: string }> = {
  strike: { label: "Strike", unit: "°", type: "plane" },
  dip: { label: "Dip", unit: "°", type: "plane" },
  azimuth: { label: "Azimuth", unit: "°", type: "lineation" },
  plunge: { label: "Plunge", unit: "°", type: "lineation" },
  temperature:    { label: "Water Temp",         unit: "°C",     type: "water" },
  ph:             { label: "pH Level",            unit: "",       type: "any"   },
  do:             { label: "Dissolved Oxygen",    unit: "mg/L",   type: "water" },
  conductivity:   { label: "Conductivity",        unit: "μS/cm",  type: "water" },
  turbidity:      { label: "Turbidity",           unit: "FNU",    type: "water" },
  flowRate:       { label: "Flow Rate",           unit: "m³/s",   type: "water" },
  hardness:       { label: "Hardness",            unit: "Mohs",   type: "rock"  },
  specificGravity:{ label: "Specific Gravity",    unit: "",       type: "rock"  },
  weight:         { label: "Weight",              unit: "g",      type: "any"   },
  depth:          { label: "Depth",               unit: "cm",     type: "soil_sand" },
  organicMatter:  { label: "Organic Matter",      unit: "%",      type: "soil_sand" },
  pidReading:     { label: "PID Reading",         unit: "",       type: "air" },
  ambientTemperature: { label: "Ambient Temp",    unit: "°C",     type: "air" },
  relativeHumidity: { label: "Relative Humidity", unit: "%",      type: "air" },
};


export function figureNumber(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

type FigureRecord = { sampleType: string; fields?: unknown };

/** A separate namespace keeps custom names from overwriting built-in values. */
export function sampleFigureFields(sample: FigureRecord) {
  const fields = sample.fields && typeof sample.fields === "object"
    ? sample.fields as Record<string, unknown> : {};
  const values: Record<string, unknown> = { ...fields };
  const custom: [string, { label: string; unit: string; type: string }][] = [];
  const occurrences = new Map<string, number>();
  for (const parameter of getCustomParameters(fields, sample.sampleType)) {
    const name = normalizedParameterLabel(parameter.label, sample.sampleType);
    const occurrence = (occurrences.get(name) ?? 0) + 1;
    occurrences.set(name, occurrence);
    const key = `custom:${JSON.stringify([name, occurrence])}`;
    values[key] = parameter.value;
    custom.push([key, {
      label: `${parameter.label}${occurrence > 1 ? ` (reading ${occurrence})` : ""} — Custom`,
      unit: "", type: "any",
    }]);
  }
  return { values, custom };
}

export function figureParameters(records: ReturnType<typeof sampleFigureFields>[]) {
  const parameters = new Map(Object.entries(NUMERIC_PARAMS));
  for (const record of records) {
    for (const [key, meta] of record.custom) if (!parameters.has(key)) parameters.set(key, meta);
  }
  return [...parameters].filter(([key]) => records.some(record => figureNumber(record.values[key]) !== undefined));
}
