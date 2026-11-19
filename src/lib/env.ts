import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get appUrl() {
    const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
    return (process.env.APP_URL || fromVercel || "http://localhost:3000").replace(/\/$/, "");
  },
  get ticketSigningSecret() {
    const s = required("TICKET_SIGNING_SECRET");
    if (s.length < 32) throw new Error("TICKET_SIGNING_SECRET must be at least 32 characters");
    return s;
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get stripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY || null;
  },
  get stripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET || null;
  },
  get devPaymentWebhookSecret() {
    return process.env.DEV_PAYMENT_WEBHOOK_SECRET || null;
  },
  get cronSecret() {
    return process.env.CRON_SECRET || null;
  },
};
