import type { NextRequest } from "next/server";
import { POST as StripeWebhookPost } from "../../../stripe/webhook/route";

export const runtime = "nodejs";

export function POST(req: NextRequest) {
  return StripeWebhookPost(req);
}
