import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import * as postmark from "postmark";

export const runtime = "nodejs";

type EmailRequest = {
  to: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  template?: string;
  templateModel?: Record<string, any>;
};

export async function POST(request: NextRequest) {
  try {
    const apiToken = process.env.POSTMARK_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
    }

    const fromEmail = process.env.POSTMARK_FROM_EMAIL || "noreply@cannafam.app";

    // Authenticate user
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {},
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Only allow authenticated users or admin to send emails
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as EmailRequest;

    if (!body.to || !body.subject) {
      return NextResponse.json({ error: "Missing required fields: to, subject" }, { status: 400 });
    }

    if (!body.htmlBody && !body.textBody && !body.template) {
      return NextResponse.json({ error: "Must provide htmlBody, textBody, or template" }, { status: 400 });
    }

    const client = new postmark.ServerClient(apiToken);

    let result;

    if (body.template) {
      // Send using a template
      result = await client.sendEmailWithTemplate({
        From: fromEmail,
        To: body.to,
        TemplateAlias: body.template,
        TemplateModel: body.templateModel || {},
      });
    } else {
      // Send regular email
      result = await client.sendEmail({
        From: fromEmail,
        To: body.to,
        Subject: body.subject,
        HtmlBody: body.htmlBody,
        TextBody: body.textBody,
      });
    }

    return NextResponse.json({
      success: true,
      messageId: result.MessageID,
    });
  } catch (e) {
    console.error("[Email API] Error:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
