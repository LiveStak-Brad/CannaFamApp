import Stripe from "stripe";
import { assertStripeEnv, env } from "@/lib/env";

let stripeSingleton: Stripe | null = null;

export function stripe() {
  assertStripeEnv();
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(env.stripeSecretKey, {
      apiVersion: "2023-10-16",
      typescript: true,
    });
  }
  return stripeSingleton;
}
