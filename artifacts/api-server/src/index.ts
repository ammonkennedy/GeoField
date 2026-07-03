import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient.js";
import app from "./app.js";

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
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    console.log("Stripe webhook configured");

    stripeSync
      .syncBackfill()
      .then(() => console.log("Stripe data synced"))
      .catch((e: any) => console.error("Stripe backfill error:", e));
  } catch (err: any) {
    console.error("Stripe init error (non-fatal):", err.message);
  }
}

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

await initStripe();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
