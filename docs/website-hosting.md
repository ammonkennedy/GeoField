# GeoField website hosting

Public URL: https://master.d2vn10cqbsssgw.amplifyapp.com

AWS console: select US East (Ohio), us-east-2, then Amplify → GeoField → master.
The existing app ID is d2vn10cqbsssgw. No new AWS app, account pool, or database is needed.

## Using the existing address

1. Open the public URL in Safari or another browser.
2. Sign in using the same GeoField account used on the phone.
3. On the phone, run the updated app and complete Sync while online.
4. On the website, use Sync and compare samples, measurements/photos, notes, and trips.
5. For a full round-trip check, make a clearly labeled test record on one device, sync both, then verify an edit from the other device. Do not delete existing data to troubleshoot syncing.

The website and iPhone build use the same Cognito user pool/client, AppSync API, and S3 bucket. Browser-local data is separate from phone-local data; each must sync. Running a simulator does not update the physical iPhone app.

## Direct-link routing

The September 21 inspection found that the homepage and JavaScript bundle return HTTP 200, but direct requests for /login, /map, /strike-dip, /notes, /trip/test, and /support return HTTP 404. The existing fallback rule is /<*> → /index.html with status 404-200.

Approved and applied fix: in Amplify → GeoField → Hosting → Rewrites and redirects, add this rule before the existing fallback:

```json
{
  "source": "</^[^.]+$/>",
  "target": "/index.html",
  "status": "200"
}
```

This matches extensionless client-side routes, preserving real static file paths. Save existing rules before applying; restore them if needed. Check a direct link and refresh after AWS propagates the change.

AWS reference: https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html

## Deployment

The master branch has automatic builds enabled and is connected to https://github.com/ammonkennedy/GeoField. The latest inspected successful deployment was job 178, commit e5fe48c62bcec0de284617eec073843d235d3a78, matching the local HEAD. Deployed JavaScript includes trip/photo sync and lineation repair.

The AWS console build specification differs from the repository's amplify.yml. Keep that in mind when changing build commands; do not replace it without reviewing a build. A production deployment is not proof of successful account sign-in or bidirectional data syncing.

No custom domain is currently attached. A custom domain can later be added under Hosting → Custom domains, using an Amplify-managed HTTPS certificate. A domain purchase is separate from using this existing AWS address.

## Verification after approved routing change

Direct HTTPS requests now return HTTP 200 and the app shell for /, /login, /map, /strike-dip, /notes, /trip/test, and /support. The main JavaScript bundle also returns HTTP 200. Isolated Chromium checks verified login/signup forms, the guest dashboard, measurements, notes, figures, map, and support pages with no uncaught JavaScript errors. These checks did not submit sign-up emails, sign in with a password, or modify user data.

A missing decorative topo-bg.png caused 404 requests on login/support. The local source now supplies a lightweight SVG and references it instead; that cosmetic fix needs the next frontend deployment. The production routing fix is already live and does not require a source push. Remaining acceptance check: sign into the same account on website and phone, Sync both, and compare/round-trip a clearly labeled test record including its photo.
