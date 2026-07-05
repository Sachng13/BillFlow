import { Subscription } from "@/models/Subscription";

/**
 * Lazy lifecycle transitions run on read (no cron in this assignment).
 * - cancelAtPeriodEnd + past currentPeriodEnd → status cancelled
 */
export async function applySubscriptionLifecycle(
  subscription: InstanceType<typeof Subscription> | null
): Promise<InstanceType<typeof Subscription> | null> {
  if (!subscription) return null;

  const now = new Date();

  if (
    subscription.status === "active" &&
    subscription.cancelAtPeriodEnd &&
    subscription.currentPeriodEnd &&
    now > new Date(subscription.currentPeriodEnd)
  ) {
    subscription.status = "cancelled";
    await subscription.save();
  }

  return subscription;
}
