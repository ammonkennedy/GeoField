import { getUncachableStripeClient } from "./stripeClient.js";

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log("Checking for existing GeoField Pro product...");

    const existing = await stripe.products.search({ query: "name:'GeoField Pro' AND active:'true'" });
    if (existing.data.length > 0) {
      console.log("GeoField Pro already exists:", existing.data[0].id);
      const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
      prices.data.forEach((p) => console.log(`  Price: ${p.id} — $${(p.unit_amount ?? 0) / 100}/${(p.recurring as any)?.interval}`));
      return;
    }

    const product = await stripe.products.create({
      name: "GeoField Pro",
      description: "Full access to GeoField — geology field data collection, maps, and analysis tools.",
    });
    console.log("Created product:", product.id);

    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: 999,
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log("Created monthly price:", monthly.id, "($9.99/month)");

    const yearly = await stripe.prices.create({
      product: product.id,
      unit_amount: 8999,
      currency: "usd",
      recurring: { interval: "year" },
    });
    console.log("Created yearly price:", yearly.id, "($89.99/year)");

    console.log("\nDone! Copy these price IDs into your subscription page.");
    console.log(`Monthly: ${monthly.id}`);
    console.log(`Yearly:  ${yearly.id}`);
  } catch (err: any) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

createProducts();
