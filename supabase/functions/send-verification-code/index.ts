import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function buildVerificationEmailHtml(code: string, userName: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">AlphaTek Nexus</h1>
<p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">Email Verification</p>
</td></tr>
<tr><td style="padding:32px 40px 0;text-align:center;">
<h2 style="margin:0 0 4px;color:#0f172a;font-size:20px;font-weight:700;">Verify your email address</h2>
<p style="margin:0;color:#64748b;font-size:14px;">Hi ${userName}, use the code below to verify your email and activate your account.</p>
</td></tr>
<tr><td style="padding:28px 40px;text-align:center;">
<div style="display:inline-block;padding:20px 40px;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
<span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#0f172a;font-family:'SF Mono','Fira Code',monospace;">${code}</span>
</div>
<p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">This code expires in 10 minutes.</p>
</td></tr>
<tr><td style="padding:0 40px 32px;text-align:center;">
<p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">If you didn't create an account, you can safely ignore this email.<br/>No reply is needed.</p>
<p style="margin:16px 0 0;color:#cbd5e1;font-size:11px;">&copy; AlphaTek Nexus. All rights reserved.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData } = await supabase.auth.getUser(token);
    if (!authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userEmail = authData.user.email;
    if (!userEmail) {
      return new Response(JSON.stringify({ error: "No email found for user" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate and store the 6-digit code via RPC
    const { error: genError } = await supabase.rpc("generate_email_verification_code", {
      target_email: userEmail,
    });

    if (genError) {
      // Rate-limit errors carry the "Too many" prefix; other errors are server faults.
      const isRateLimit = genError.message.toLowerCase().includes("too many");
      return new Response(JSON.stringify({ error: genError.message }), {
        status: isRateLimit ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the most recent unverified code for this email
    const { data: codeData } = await supabase
      .from("email_verification_codes")
      .select("code")
      .eq("email", userEmail)
      .eq("verified", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!codeData?.code) {
      return new Response(JSON.stringify({ error: "Failed to generate code" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userName = (authData.user.user_metadata as any)?.full_name || userEmail.split("@")[0];

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("send-verification-code: RESEND_API_KEY is not configured in Supabase Edge Function secrets");
      return new Response(JSON.stringify({ error: "Resend email service is not configured. Set RESEND_API_KEY in Supabase Edge Function secrets." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AlphaTek Nexus <noreply@alphateknexus.com>",
        to: [userEmail],
        subject: "Your verification code - AlphaTek Nexus",
        html: buildVerificationEmailHtml(codeData.code, userName),
        text: `AlphaTek Nexus - Email Verification\n\nHi ${userName},\n\nYour verification code is: ${codeData.code}\n\nThis code expires in 10 minutes. If you didn't create an account, you can safely ignore this email.`,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("send-verification-code delivery failure:", errText);
      return new Response(JSON.stringify({ error: `Resend rejected the email request (${resendRes.status}). Check the Resend API key and verified sender domain.` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-verification-code error:", err);
    return new Response(JSON.stringify({ error: "Could not send verification code" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
