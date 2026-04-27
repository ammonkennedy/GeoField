import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient.js";

const router: IRouter = Router();

const PROMO_CODE = "AKdleifoeg12!@";

// Helper: get or create Stripe customer for the authed user
async function getOrCreateCustomer(userId: string, email?: string | null) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new Error("User not found");

  if (user.stripeCustomerId) return { customerId: user.stripeCustomerId, user };

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { userId },
  });

  await db.update(usersTable)
    .set({ stripeCustomerId: customer.id })
    .where(eq(usersTable.id, userId));

  return { customerId: customer.id, user: { ...user, stripeCustomerId: customer.id } };
}

// GET /api/stripe/status — subscription + trial + promo status for current user
router.get("/stripe/status", async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthenticated" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  if (!user) return res.status(404).json({ error: "User not found" });

  // Promo code → full access
  if (user.promoCodeUsed) {
    return res.json({ access: "promo", promoCode: user.promoCodeUsed });
  }

  // Active subscription
  if (user.stripeSubscriptionId) {
    const stripe = await getUncachableStripeClient();
    try {
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      const active = sub.status === "active" || sub.status === "trialing";
      return res.json({
        access: active ? "subscribed" : "expired",
        subscription: {
          status: sub.status,
          currentPeriodEnd: (sub as any).current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      });
    } catch {
      // subscription fetch failed, fall through
    }
  }

  // Trial logic
  if (user.trialStartedAt) {
    const trialEnd = new Date(user.trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    if (now < trialEnd) {
      const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return res.json({ access: "trial", daysLeft, trialEnd: trialEnd.toISOString() });
    } else {
      return res.json({ access: "expired" });
    }
  }

  // No trial started yet
  return res.json({ access: "none" });
});

// POST /api/stripe/trial/start — start the 7-day trial for current user
router.post("/stripe/trial/start", async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthenticated" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.trialStartedAt || user.promoCodeUsed || user.stripeSubscriptionId) {
    return res.status(400).json({ error: "Trial already used or not eligible" });
  }

  await db.update(usersTable)
    .set({ trialStartedAt: new Date() })
    .where(eq(usersTable.id, req.user.id));

  const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  res.json({ success: true, trialEnd: trialEnd.toISOString(), daysLeft: 7 });
});

// POST /api/stripe/promo — redeem a promo code for full access
router.post("/stripe/promo", async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthenticated" });
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided" });

  if (code !== PROMO_CODE) {
    return res.status(400).json({ error: "Invalid promo code" });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.promoCodeUsed) return res.json({ success: true, message: "Already applied" });

  await db.update(usersTable)
    .set({ promoCodeUsed: code })
    .where(eq(usersTable.id, req.user.id));

  res.json({ success: true, message: "Promo code applied — full access granted!" });
});

// GET /api/stripe/publishable-key — return the Stripe publishable key to the frontend
router.get("/stripe/publishable-key", async (_req, res) => {
  const key = await getStripePublishableKey();
  res.json({ publishableKey: key });
});

// POST /api/stripe/checkout — create a Stripe Checkout session (subscription with 7-day trial)
router.post("/stripe/checkout", async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthenticated" });
  const { priceId } = req.body;
  if (!priceId) return res.status(400).json({ error: "priceId required" });

  const { customerId } = await getOrCreateCustomer(req.user.id, req.user.email);

  const stripe = await getUncachableStripeClient();
  const host = `${req.protocol}://${req.get("host")}`;

  // Check if they already used a trial
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  const alreadyTrialed = !!user?.trialStartedAt;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    subscription_data: alreadyTrialed ? {} : { trial_period_days: 7 },
    success_url: `${host}/geofield/subscription?success=1`,
    cancel_url: `${host}/geofield/subscription?cancelled=1`,
  });

  // Record trial start if this is their first time
  if (!alreadyTrialed) {
    await db.update(usersTable)
      .set({ trialStartedAt: new Date() })
      .where(eq(usersTable.id, req.user.id));
  }

  res.json({ url: session.url });
});

// POST /api/stripe/portal — create a Stripe Customer Portal session
router.post("/stripe/portal", async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthenticated" });

  const { customerId } = await getOrCreateCustomer(req.user.id, req.user.email);
  const stripe = await getUncachableStripeClient();
  const host = `${req.protocol}://${req.get("host")}`;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${host}/geofield/subscription`,
  });

  res.json({ url: portalSession.url });
});

// GET /api/stripe/prices — list active subscription prices
router.get("/stripe/prices", async (_req, res) => {
  const stripe = await getUncachableStripeClient();
  const prices = await stripe.prices.list({ active: true, type: "recurring", expand: ["data.product"] });
  res.json({ data: prices.data });
});

export default router;
