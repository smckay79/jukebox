import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getStripe, getAppUrl } from "@/lib/stripe";
import { updateUserStripeFields } from "@/lib/users";
import { TRIAL_DURATION_MS } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  let body: { plan?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plan = body.plan === "yearly" ? "yearly" : "monthly";
  const priceId =
    plan === "yearly"
      ? process.env.STRIPE_PRICE_YEARLY
      : process.env.STRIPE_PRICE_MONTHLY;

  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price ID not configured for ${plan}` },
      { status: 503 },
    );
  }

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await updateUserStripeFields(user.id, { stripeCustomerId: customerId });
  }

  const trialEnd = user.createdAt + TRIAL_DURATION_MS;
  const now = Date.now();
  const trialRemaining = Math.max(0, trialEnd - now);
  const trialDays = Math.ceil(trialRemaining / (24 * 60 * 60 * 1000));
  const hasActiveSub =
    user.subscriptionPaidUntil && user.subscriptionPaidUntil > now;

  const appUrl = getAppUrl();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    ...(trialDays > 0 && !hasActiveSub
      ? { subscription_data: { trial_period_days: trialDays } }
      : {}),
    success_url: `${appUrl}/pricing?success=1`,
    cancel_url: `${appUrl}/pricing?canceled=1`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
