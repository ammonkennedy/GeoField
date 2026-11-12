import { preSignUp } from "./pre-sign-up/resource";
import { defineAuth } from "@aws-amplify/backend";

/**
 * GeoField user accounts.
 *
 * Users sign in with email/password. Amplify/Cognito stores passwords securely;
 * the app should only keep the logged-in session on the device, not raw passwords.
 */
export const auth = defineAuth({
  triggers: { preSignUp },
  loginWith: {
    email: true,
  },
});
