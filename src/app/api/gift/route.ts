import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  void req;
  return NextResponse.json(
    {
      error: "Legacy gifting has been removed. Use coin gifting via POST /api/gifts/send.",
    },
    { status: 410 },
  );
}
