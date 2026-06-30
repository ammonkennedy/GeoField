import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * Cloud data model for GeoField.
 *
 * Each model uses owner authorization so records are isolated by the logged-in user.
 * This is the foundation for syncing samples/datasets across devices.
 */
const schema = a.schema({
  Dataset: a
    .model({
      name: a.string().required(),
      description: a.string(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [allow.owner()]),

  Sample: a
    .model({
      sampleType: a.enum(["water", "rock", "soil_sand"]),
      sampleId: a.string().required(),
      datasetId: a.id(),
      notes: a.string(),
      fields: a.json(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [allow.owner()]),

  StrikeDipMeasurement: a
    .model({
      label: a.string(),
      strike: a.string(),
      dip: a.string(),
      dipDir: a.string(),
      location: a.string(),
      latitude: a.float(),
      longitude: a.float(),
      gpsAccuracy: a.float(),
      utmZone: a.string(),
      utmEasting: a.float(),
      utmNorthing: a.float(),
      date: a.date(),
      featureType: a.string(),
      notes: a.string(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
