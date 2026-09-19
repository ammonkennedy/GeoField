import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// These fields are read/written by the measurement API. Amplify generates its
// default response selection from this metadata, not amplify/data/resource.ts.
const measurementFields = {
  measuredAt: "String",
  elevation: "Float", elevationAccuracy: "Float",
  datasetId: "ID", measurementType: "String", trendDegrees: "Float",
  plungeDegrees: "Float", lineVector: "AWSJSON", rockLayerType: "String",
  magneticHeading: "Float", trueHeading: "Float", magneticDeclination: "Float",
  referenceFrame: "String", rawMagneticStrikeDegrees: "Float", deletedAt: "AWSDateTime",
};

export function checkAmplifyModel(outputs) {
  const noteFields = outputs?.data?.model_introspection?.models?.FieldNote?.fields;
  for (const [name, type] of Object.entries({ title: "String", body: "String", photos: "AWSJSON", deletedAt: "AWSDateTime" })) {
    if (noteFields?.[name]?.type !== type) throw new Error(`Outdated amplify_outputs.json: FieldNote.${name} is missing or incompatible. Refresh outputs from the deployed backend before building.`);
  }
  const fields = outputs?.data?.model_introspection?.models?.StrikeDipMeasurement?.fields;
  const missing = Object.entries(measurementFields)
    .filter(([name, type]) => fields?.[name]?.type !== type)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Outdated amplify_outputs.json: measurement fields missing or incompatible: ${missing.join(", ")}. Refresh outputs from the deployed backend in us-east-2 before building. See scripts/refresh-amplify-outputs.md.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkAmplifyModel(JSON.parse(readFileSync(new URL("../amplify_outputs.json", import.meta.url), "utf8")));
  console.log("Amplify measurement and notes model configuration verified.");
}
