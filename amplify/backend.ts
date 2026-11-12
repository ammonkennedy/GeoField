import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource.ts";
import { data } from "./data/resource.ts";
import { storage } from "./storage/resource.ts";

/**
 * GeoField cloud backend.
 *
 * Auth creates the user accounts.
 * Data creates per-user cloud tables for datasets and samples.
 */
export const backend = defineBackend({
  auth,
  data,
  storage,
});

// Allow a verified recovery request to reuse the current/previous password.
backend.auth.resources.cfnResources.cfnUserPool.addPropertyOverride(
  "Policies.PasswordPolicy.PasswordHistorySize", 0,
);
backend.auth.resources.cfnResources.cfnUserPool.addPropertyOverride(
  "AccountRecoverySetting.RecoveryMechanisms", [{ Name: "verified_email", Priority: 1 }],
);
