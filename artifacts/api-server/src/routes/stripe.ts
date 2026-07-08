import { Router, type IRouter, type Request } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireCognitoUser } from "../lib/cognitoAuth.js";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient.js";

const router: IRouter = Router();

function getOrigin(req: Request) {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  return req.headers.origin || `${req.protocol}://${req.get("host")}`;
}

function getSafeReturnPath(value: unknown) {
  if (typeof value !== "string") return "/subscription";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/subscription";
}

async function getOrCreateBillingUser(user: Express.User) {
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (existing) {
    await db
      .update(usersTable)
      .set({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      })
      .where(eq(usersTable.id, user.id));
    return { ...existing, email: user.email, firstName: user.firstName, lastName: user.lastName };
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    })
    .returning();

  return created;
}

async function getOrCreateCustomer(user: Express.User) {
  const billingUser = await getOrCreateBillingUser(user);
  if (billingUser.stripeCustomerId) return { customerId: billingUser.stripeCustomerId, user: billingUser };

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
    metadata: { accountId: user.id },
  });

  await db
    .update(usersTable)
    .set({ stripeCustomerId: customer.id })
    .where(eq(usersTable.id, user.id));

  return { customerId: customer.id, user: { ...billingUser, stripeCustomerId: customer.id } };
}

router.get("/stripe/status", requireCognitoUser, async (req, res) => {
  const billingUser = await getOrCreateBillingUser(req.user!);
  if (!billingUser.stripeCustomerId) {
    res.json({
      access: "free",
      customerExists: false,
      paymentMethodConfigured: false,
    });
    return;
  }

  const stripe = await getUncachableStripeClient();
  const paymentMethods = await stripe.paymentMethods.list({
    customer: billingUser.stripeCustomerId,
    type: "card",
    limit: 1,
  });
  const card = paymentMethods.data[0]?.card;

  res.json({
    access: "free",
    customerExists: true,
    paymentMethodConfigured: paymentMethods.data.length > 0,
    paymentMethod: card
      ? {
          brand: card.brand,
          last4: card.last4,
          expMonth: card.exp_month,
          expYear: card.exp_year,
        }
      : null,
  });
});

router.post("/stripe/setup", requireCognitoUser, async (req, res) => {
  const { customerId } = await getOrCreateCustomer(req.user!);
  const stripe = await getUncachableStripeClient();
  const returnPath = getSafeReturnPath(req.body?.returnPath);
  const origin = getOrigin(req);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "setup",
    payment_method_types: ["card"],
    success_url: `${origin}${returnPath}?billing=ready`,
    cancel_url: `${origin}${returnPath}?billing=cancelled`,
  });

  res.json({ url: session.url });
});

router.post("/stripe/portal", requireCognitoUser, async (req, res) => {
  const { customerId } = await getOrCreateCustomer(req.user!);
  const stripe = await getUncachableStripeClient();
  const returnPath = getSafeReturnPath(req.body?.returnPath);

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getOrigin(req)}${returnPath}`,
  });

  res.json({ url: portalSession.url });
});

router.post("/stripe/checkout", (_req, res) => {
  res.status(410).json({ error: "Subscription checkout is disabled while GeoField is free." });
});

router.post("/stripe/trial/start", (_req, res) => {
  res.status(410).json({ error: "Trials are disabled while GeoField is free." });
});

router.post("/stripe/promo", (_req, res) => {
  res.status(410).json({ error: "Promo codes are disabled while GeoField is free." });
});

router.get("/stripe/prices", (_req, res) => {
  res.json({ data: [] });
});

router.get("/stripe/publishable-key", async (_req, res) => {
  const key = await getStripePublishableKey();
  res.json({ publishableKey: key });
});

export default router;
