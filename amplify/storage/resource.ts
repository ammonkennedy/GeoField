import { defineStorage } from "@aws-amplify/backend";

/** Private sample photos and videos, scoped to the signed-in Cognito identity. */
export const storage = defineStorage({
  name: "geofieldMedia",
  access: (allow) => ({
    "media/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
    ],
  }),
});
