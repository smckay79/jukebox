import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  getUserByStripeCustomerId,
  updateUserStripeFields,
} from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function getPeriodEnd(sub: Stripe.Subscription): number {
  const item = sub.items?.data?.[0];
  if (item?.current_period_end) return item.current_period_end * 1000;
  if (sub.trial_end) return sub.trial_end * 1000;
  return Date.now() + 30 * 24 * 60 * 60 * 1000;
}

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe] Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === "payment" && session.metadata?.plan === "lifetime") {
        const customerId = getCustomerId(session.customer);
        if (customerId) {
          const user = await getUserByStripeCustomerId(customerId);
          if (user) {
            const lifetime = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
            await updateUserStripeFields(user.id, {
              subscriptionPaidUntil: lifetime,
              subscriptionSource: "stripe",
            });
            console.log(
              `[stripe] checkout.session.completed (lifetime) → user ${user.email} pro forever`,
            );
          }
        }
      } else if (session.mode === "subscription" && session.customer && session.subscription) {
        const customerId = getCustomerId(session.customer);
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;

        if (customerId) {
          const user = await getUserByStripeCustomerId(customerId);
          if (user) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const periodEnd = getPeriodEnd(sub);
            await updateUserStripeFields(user.id, {
              stripeSubscriptionId: subscriptionId,
              subscriptionPaidUntil: periodEnd,
              subscriptionSource: "stripe",
            });
            console.log(
              `[stripe] checkout.session.completed → user ${user.email} pro until ${new Date(periodEnd).toISOString()}`,
            );
          }
        }
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = getCustomerId(invoice.customer);
      const subscriptionId =
        invoice.parent?.subscription_details?.subscription;
      const subId =
        typeof subscriptionId === "string"
          ? subscriptionId
          : subscriptionId?.id;

      if (customerId && subId) {
        const user = await getUserByStripeCustomerId(customerId);
        if (user) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const periodEnd = getPeriodEnd(sub);
          await updateUserStripeFields(user.id, {
            stripeSubscriptionId: subId,
            subscriptionPaidUntil: periodEnd,
            subscriptionSource: "stripe",
          });
          console.log(
            `[stripe] invoice.paid → user ${user.email} renewed until ${new Date(periodEnd).toISOString()}`,
          );
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = getCustomerId(sub.customer);
      if (customerId) {
        const user = await getUserByStripeCustomerId(customerId);
        if (user) {
          await updateUserStripeFields(user.id, {
            stripeSubscriptionId: undefined,
            subscriptionPaidUntil: Date.now(),
            subscriptionSource: "stripe",
          });
          console.log(
            `[stripe] subscription.deleted → user ${user.email} downgraded`,
          );
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = getCustomerId(sub.customer);
      if (customerId) {
        const user = await getUserByStripeCustomerId(customerId);
        if (user) {
          if (sub.status === "active" || sub.status === "trialing") {
            const periodEnd = getPeriodEnd(sub);
            await updateUserStripeFields(user.id, {
              stripeSubscriptionId: sub.id,
              subscriptionPaidUntil: periodEnd,
              subscriptionSource: "stripe",
            });
          } else if (
            sub.status === "canceled" ||
            sub.status === "unpaid" ||
            sub.status === "past_due"
          ) {
            await updateUserStripeFields(user.id, {
              subscriptionPaidUntil: Date.now(),
              subscriptionSource: "stripe",
            });
          }
        }
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
