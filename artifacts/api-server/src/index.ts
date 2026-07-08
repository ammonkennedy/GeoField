import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient.js";
import app from "./app.js";

function getPublicAppUrl() {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0];
  return replitDomain ? `https://${replitDomain}` : null;
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("DATABASE_URL not set — skipping Stripe initialization");
    return;
  }
  try {
    console.log("Initializing Stripe schema...");
    await runMigrations({ databaseUrl });
    console.log("Stripe schema ready");

    const stripeSync = await getStripeSync();
    const webhookBaseUrl = getPublicAppUrl();
    if (webhookBaseUrl) {
      await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
      console.log("Stripe webhook configured");
    } else {
      console.warn("PUBLIC_APP_URL not set — skipping Stripe webhook configuration");
    }

    stripeSync
      .syncBackfill()
      .then(() => console.log("Stripe data synced"))
      .catch((e: any) => console.error("Stripe backfill error:", e));
  } catch (err: any) {
    console.error("Stripe init error (non-fatal):", err.message);
  }
}

async function main() {
  const rawPort = process.env["PORT"];
  if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

  await initStripe();

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
