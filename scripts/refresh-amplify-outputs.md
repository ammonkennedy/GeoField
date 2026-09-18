# Refresh the native app's Amplify model configuration

The generated client selects response fields using `amplify_outputs.json`.
Updating `amplify/data/resource.ts` alone does not update local Xcode builds.
After deploying backend model changes, generate fresh outputs:

```sh
AWS_REGION=us-east-2 pnpm exec ampx generate outputs --app-id d2vn10cqbsssgw --branch master --out-dir /tmp/geofield-deployed-outputs
```

Before replacing the root `amplify_outputs.json`, verify that the generated API
URL, Cognito user pool, and app client match the existing environment. Then copy
the file and run the web build/Xcode asset copy. Never switch account environments
to work around missing model fields.

The web build and workspace typecheck validate the measurement fields, preventing
a stale configuration from silently omitting dataset and lineation data again.
