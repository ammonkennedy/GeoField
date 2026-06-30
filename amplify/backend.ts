import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource.ts";
import { data } from "./data/resource.ts";

/**
 * GeoField cloud backend.
 *
 * Auth creates the user accounts.
 * Data creates per-user cloud tables for datasets and samples.
 */
export const backend = defineBackend({
  auth,
  data,
});
