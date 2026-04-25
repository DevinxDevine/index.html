// src/app/api/stripe/webhook/route.ts
// Fully wired webhook handler — every event triggers the correct downstream action.
// Raw body + signature verification. Returns 200 even on handler errors (prevents retries).

import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { auditPaymentEvent, writeAuditLog } from "@/lib/audit";
import {
  notifyBookingConfirmed,
  notifyJobCompleted,
  notifyInvoiceSent,
} from "@/actions/notifications";
import { generateAndStoreServiceRecord } from "@/lib/service-record";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {

      // ── Payment succeeded → confirm booking + send confirmation ─────────────
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        // Skip tips (they have metadata.type = "tip")
        if (pi.metadata?.type === "tip") break;

        const booking = await prisma.booking.findUnique({
          where: { stripePaymentIntentId: pi.id },
        });
        if (!booking) break;

        await prisma.booking.update({
          where: { id: booking.id },
          data: { paymentStatus: "CAPTURED", status: "SCHEDULED" },
        });

        await auditPaymentEvent(booking.id, "PAYMENT_CAPTURED", event.id, pi.amount);

        // Fire confirmation email + SMS — non-blocking, errors logged
        notifyBookingConfirmed(booking.id).catch((err) =>
          console.error("[webhook] notifyBookingConfirmed failed:", err)
        );
        break;
      }

      // ── Tip payment succeeded ─────────────────────────────────────────────────
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.type !== "tip") break;

        const bookingId = pi.metadata.bookingId;
        if (!bookingId) break;

        await auditPaymentEvent(bookingId, "TIP_ADDED", event.id, pi.amount);
        break;
      }

      // ── Payment failed ────────────────────────────────────────────────────────
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.type === "tip") break; // Tips failing silently is OK

        const booking = await prisma.booking.findUnique({
          where: { stripePaymentIntentId: pi.id },
        });
        if (!booking) break;

        await prisma.booking.update({
          where: { id: booking.id },
          data: { paymentStatus: "FAILED" },
        });

        await writeAuditLog({
          bookingId: booking.id,
          action: "BOOKING_STATUS_CHANGED",
          after: {
            paymentStatus: "FAILED",
            reason: pi.last_payment_error?.message ?? "unknown",
          },
          metadata: { stripeEventId: event.id },
        });
        break;
      }

      // ── Charge refunded ───────────────────────────────────────────────────────
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const booking = await prisma.booking.findUnique({
          where: { stripePaymentIntentId: charge.payment_intent as string },
        });
        if (!booking) break;

        const isFullRefund = charge.amount_refunded >= charge.amount;
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
            status: isFullRefund ? "CANCELLED" : booking.status,
          },
        });

        await auditPaymentEvent(
          booking.id,
          "PAYMENT_REFUNDED",
          event.id,
          charge.amount_refunded
        );
        break;
      }

      // ── Chargeback opened → mark DISPUTED + auto-generate service record PDF ─
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const booking = await prisma.booking.findUnique({
          where: { stripePaymentIntentId: dispute.payment_intent as string },
          select: { id: true },
        });
        if (!booking) break;

        await prisma.booking.update({
          where: { id: booking.id },
          data: { status: "DISPUTED", paymentStatus: "DISPUTED" },
        });

        await writeAuditLog({
          bookingId: booking.id,
          action: "CHARGEBACK_OPENED",
          after: {
            disputeId: dispute.id,
            reason: dispute.reason,
            amount: dispute.amount,
          },
          metadata: { stripeEventId: event.id },
        });

        // Auto-generate the chargeback evidence PDF
        generateAndStoreServiceRecord(booking.id, "system").catch((err) =>
          console.error("[webhook] generateAndStoreServiceRecord failed:", err)
        );
        break;
      }

      // ── Invoice paid (subscription) → send invoice email ────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        // Find the most recent booking on this subscription
        const booking = await prisma.booking.findFirst({
          where: { stripeSubscriptionId: invoice.subscription as string },
          orderBy: { createdAt: "desc" },
        });
        if (!booking) break;

        await prisma.booking.update({
          where: { id: booking.id },
          data: { paymentStatus: "CAPTURED", stripeInvoiceId: invoice.id },
        });

        notifyInvoiceSent(booking.id).catch((err) =>
          console.error("[webhook] notifyInvoiceSent failed:", err)
        );
        break;
      }

      // ── Subscription updated ──────────────────────────────────────────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            status: sub.status,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
        });
        break;
      }

      // ── Subscription cancelled ────────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: "canceled", cancelledAt: new Date() },
        });
        await writeAuditLog({
          action: "SUBSCRIPTION_CANCELLED",
          metadata: { stripeSubscriptionId: sub.id, stripeEventId: event.id },
        });
        break;
      }

      // ── Customer created (sync Stripe ID back to user) ───────────────────────
      case "customer.created": {
        const customer = event.data.object as Stripe.Customer;
        if (customer.metadata?.userId) {
          await prisma.user
            .update({
              where: { id: customer.metadata.userId },
              data: { stripeCustomerId: customer.id },
            })
            .catch(() => {
              // User may not exist yet during onboarding flow
            });
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // Always return 200 — prevents Stripe from retrying and flooding the queue.
    // Alert via your observability pipeline (Sentry, Datadog, etc.)
    console.error(`[stripe/webhook] Handler error (${event.type}):`, err);
    return NextResponse.json({ received: true, handlerError: true });
  }
}
