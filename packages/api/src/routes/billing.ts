import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { authGuard } from "../middleware/auth.js";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

const PRICE_MAP: Record<string, { mode: Stripe.Checkout.SessionCreateParams.Mode; plan: string }> = {
  pro: { mode: "subscription", plan: "pro" },
  lifetime: { mode: "payment", plan: "lifetime" },
};

async function getOrCreateCustomer(stripe: Stripe, userId: string, email: string): Promise<string> {
  const [user] = await db
    .select({ stripe_customer_id: schema.users.stripe_customer_id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (user?.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });

  await db
    .update(schema.users)
    .set({ stripe_customer_id: customer.id, updated_at: new Date() })
    .where(eq(schema.users.id, userId));

  return customer.id;
}

export default async function billingRoutes(app: FastifyInstance) {
  /* ---------- Create checkout session ---------- */
  app.post("/api/v1/billing/checkout", {
    preHandler: authGuard,
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const { planId } = req.body as { planId: string };
      const priceEnv = planId === "pro" ? "STRIPE_PRO_PRICE_ID" : "STRIPE_LIFETIME_PRICE_ID";
      const priceId = process.env[priceEnv];
      if (!priceId || !PRICE_MAP[planId]) {
        return reply.status(400).send({ error: "Bad Request", message: "Invalid plan" });
      }

      const stripe = getStripe();
      const [user] = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, req.userId))
        .limit(1);

      const customerId = await getOrCreateCustomer(stripe, req.userId, user.email);
      const origin = process.env.CORS_ORIGIN || "http://localhost:5173";

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: PRICE_MAP[planId].mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/?checkout=success`,
        cancel_url: `${origin}/?checkout=cancel`,
        metadata: { user_id: req.userId, plan: planId },
      });

      reply.send({ data: { url: session.url } });
    },
  });

  /* ---------- Customer portal ---------- */
  app.post("/api/v1/billing/portal", {
    preHandler: authGuard,
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const stripe = getStripe();
      const [user] = await db
        .select({ stripe_customer_id: schema.users.stripe_customer_id })
        .from(schema.users)
        .where(eq(schema.users.id, req.userId))
        .limit(1);

      if (!user?.stripe_customer_id) {
        return reply.status(400).send({ error: "Bad Request", message: "No billing account" });
      }

      const origin = process.env.CORS_ORIGIN || "http://localhost:5173";
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: origin,
      });

      reply.send({ data: { url: portalSession.url } });
    },
  });

  /* ---------- Current plan ---------- */
  app.get("/api/v1/billing/plan", {
    preHandler: authGuard,
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const [user] = await db
        .select({
          plan: schema.users.plan,
          plan_expires_at: schema.users.plan_expires_at,
        })
        .from(schema.users)
        .where(eq(schema.users.id, req.userId))
        .limit(1);

      reply.send({ data: user });
    },
  });

  /* ---------- Stripe webhook ---------- */
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: 1048576 },
    (_req, body, done) => { done(null, body); }
  );

  app.post("/api/v1/billing/webhook", async (req: FastifyRequest, reply: FastifyReply) => {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"] as string;
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret) {
      app.log.error("STRIPE_WEBHOOK_SECRET not set");
      return reply.status(500).send({ error: "Webhook not configured" });
    }

    let event: Stripe.Event;
    try {
      const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      event = stripe.webhooks.constructEvent(body, sig, secret);
    } catch (err: any) {
      app.log.error(`Webhook signature verification failed: ${err.message}`);
      return reply.status(400).send({ error: "Invalid signature" });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;
        if (!userId || !plan) break;

        const updates: Record<string, unknown> = {
          plan,
          updated_at: new Date(),
        };

        if (session.subscription) {
          updates.stripe_subscription_id = session.subscription as string;
        }

        if (plan === "lifetime") {
          updates.plan_expires_at = null;
        }

        await db.update(schema.users).set(updates).where(eq(schema.users.id, userId));
        app.log.info(`Plan updated to ${plan} for user ${userId}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const [user] = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.stripe_customer_id, customerId))
          .limit(1);
        if (!user) break;

        if (sub.status === "active" || sub.status === "trialing") {
          const periodEnd = (sub as any).current_period_end as number | undefined;
          await db.update(schema.users).set({
            plan: "pro",
            plan_expires_at: periodEnd ? new Date(periodEnd * 1000) : null,
            updated_at: new Date(),
          }).where(eq(schema.users.id, user.id));
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const [user] = await db
          .select({ id: schema.users.id, plan: schema.users.plan })
          .from(schema.users)
          .where(eq(schema.users.stripe_customer_id, customerId))
          .limit(1);
        if (!user) break;

        if (user.plan === "pro") {
          await db.update(schema.users).set({
            plan: "free",
            stripe_subscription_id: null,
            plan_expires_at: null,
            updated_at: new Date(),
          }).where(eq(schema.users.id, user.id));
          app.log.info(`Subscription cancelled, reverted to free for user ${user.id}`);
        }
        break;
      }
    }

    reply.send({ received: true });
  });
}
