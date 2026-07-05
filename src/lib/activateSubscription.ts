import { Subscription } from "@/models/Subscription";
import { Invoice } from "@/models/Invoice";
import { User } from "@/models/User";
import { Plan } from "@/models/Plan";
import {
  sendSubscriptionCreated,
  sendPaymentConfirmed,
  sendInvoiceGenerated,
  sendPlanChanged,
} from "@/lib/email";
import { logError } from "@/lib/logger";

export type OrderPaymentResult = {
  type: "new_subscription" | "upgrade";
  activated: boolean;
  alreadyComplete: boolean;
  subscriptionId: string;
};

export async function completeOrderPayment(
  orderId: string,
  paymentId: string,
  amountPaise?: number,
  source: "webhook" | "verify" = "webhook"
): Promise<OrderPaymentResult> {
  const subscriptionByOrder = await Subscription.findOne({ razorpayOrderId: orderId });
  if (subscriptionByOrder) {
    return completeNewSubscriptionPayment(
      subscriptionByOrder,
      orderId,
      paymentId,
      amountPaise,
      source
    );
  }

  const invoice = await Invoice.findOne({ razorpayOrderId: orderId });
  if (!invoice) {
    throw new Error(`No subscription or invoice for orderId ${orderId}`);
  }

  if (invoice.status === "paid") {
    return {
      type: "upgrade",
      activated: false,
      alreadyComplete: true,
      subscriptionId: invoice.subscriptionId.toString(),
    };
  }

  const subscription = await Subscription.findById(invoice.subscriptionId);
  if (!subscription || subscription.status !== "active") {
    throw new Error(`Cannot complete upgrade for orderId ${orderId}`);
  }

  return completeUpgradePayment(subscription, invoice, paymentId, amountPaise, source);
}

/** Alias used by webhook and verify routes */
export const activateSubscriptionByOrderId = completeOrderPayment;

async function completeNewSubscriptionPayment(
  subscription: InstanceType<typeof Subscription>,
  orderId: string,
  paymentId: string,
  amountPaise: number | undefined,
  source: "webhook" | "verify"
): Promise<OrderPaymentResult> {
  if (subscription.status === "active") {
    return {
      type: "new_subscription",
      activated: false,
      alreadyComplete: true,
      subscriptionId: subscription._id.toString(),
    };
  }

  const now = new Date();
  const plan = await Plan.findById(subscription.planId);
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + (plan?.intervalDays ?? 30));

  subscription.status = "active";
  subscription.razorpayPaymentId = paymentId;
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = periodEnd;
  await subscription.save();

  const invoice = await markInvoicePaid(orderId, paymentId);
  await sendNewSubscriptionEmails(subscription, plan, invoice, amountPaise, source);

  return {
    type: "new_subscription",
    activated: true,
    alreadyComplete: false,
    subscriptionId: subscription._id.toString(),
  };
}

async function completeUpgradePayment(
  subscription: InstanceType<typeof Subscription>,
  invoice: InstanceType<typeof Invoice>,
  paymentId: string,
  amountPaise: number | undefined,
  source: "webhook" | "verify"
): Promise<OrderPaymentResult> {
  const now = new Date();
  const currentPlan = await Plan.findById(subscription.planId);
  const newPlan = await Plan.findById(invoice.planId);

  if (!newPlan) {
    throw new Error(`Plan not found for upgrade invoice ${invoice.invoiceNumber}`);
  }

  const previousPlanName = currentPlan?.name ?? "previous plan";

  subscription.previousPlanId = subscription.planId;
  subscription.planId = newPlan._id;
  subscription.planChangedAt = now;
  subscription.cancelAtPeriodEnd = false;
  subscription.cancelledAt = undefined;
  await subscription.save();

  const paidInvoice = await markInvoicePaid(invoice.razorpayOrderId, paymentId);
  const paidAmount = amountPaise ?? paidInvoice?.amountPaise ?? invoice.amountPaise;
  const user = await User.findById(subscription.userId);

  if (user) {
    try {
      await sendPlanChanged(user.email, previousPlanName, newPlan.name, now);
      await sendPaymentConfirmed(user.email, paidAmount, paidInvoice?.invoiceNumber ?? invoice.invoiceNumber);
      await sendInvoiceGenerated(
        user.email,
        paidInvoice?.invoiceNumber ?? invoice.invoiceNumber,
        paidAmount,
        newPlan.name
      );
    } catch (err) {
      logError("payment.email_failed", err, { source, type: "upgrade" });
    }
  }

  return {
    type: "upgrade",
    activated: true,
    alreadyComplete: false,
    subscriptionId: subscription._id.toString(),
  };
}

async function markInvoicePaid(orderId: string, paymentId: string) {
  const now = new Date();
  return Invoice.findOneAndUpdate(
    { razorpayOrderId: orderId },
    { status: "paid", razorpayPaymentId: paymentId, paidAt: now },
    { new: true }
  );
}

async function sendNewSubscriptionEmails(
  subscription: InstanceType<typeof Subscription>,
  plan: InstanceType<typeof Plan> | null,
  invoice: InstanceType<typeof Invoice> | null,
  amountPaise: number | undefined,
  source: "webhook" | "verify"
) {
  const user = await User.findById(subscription.userId);
  const paidAmount = amountPaise ?? invoice?.amountPaise ?? plan?.amountPaise ?? 0;

  if (user && plan) {
    try {
      await sendSubscriptionCreated(user.email, plan.name, subscription.currentPeriodEnd);
      await sendPaymentConfirmed(user.email, paidAmount, invoice?.invoiceNumber ?? "");
      if (invoice) {
        await sendInvoiceGenerated(user.email, invoice.invoiceNumber, paidAmount, plan.name);
      }
    } catch (err) {
      logError("payment.email_failed", err, { source, type: "new_subscription" });
    }
  }
}

export async function assertOrderOwnedByUser(orderId: string, userId: string): Promise<boolean> {
  const subscription = await Subscription.findOne({ razorpayOrderId: orderId });
  if (subscription) {
    return subscription.userId.toString() === userId;
  }

  const invoice = await Invoice.findOne({ razorpayOrderId: orderId });
  return invoice?.userId.toString() === userId;
}
