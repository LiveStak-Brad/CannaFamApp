export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  adminEmail: "wcba.mo@gmail.com",
  photoBucket: "cfm-photos",
};

export function assertPublicEnv() {
  if (!env.supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!env.supabaseAnonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function assertServiceEnv() {
  assertPublicEnv();
  if (!env.supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
}

export function assertStripeEnv() {
  if (!env.stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!env.stripeWebhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  if (!env.siteUrl) throw new Error("Missing NEXT_PUBLIC_SITE_URL");
}
