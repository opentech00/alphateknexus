import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function buildInviteEmailHtml(referrerName: string, referralCode: string, signupUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">AlphaTek Nexus</h1>
            <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">You're Invited!</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 0;">
            <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:700;">${referrerName} invited you to AlphaTek Nexus</h2>
            <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">
              You've been invited to join AlphaTek Nexus — the all-in-one platform for
              cleaning, logistics, security, procurement, and waste management services.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;">
            <div style="background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;text-align:center;">
              <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your Referral Code</p>
              <p style="margin:0 0 16px;font-family:monospace;font-size:24px;font-weight:800;color:#0f172a;letter-spacing:2px;">${referralCode}</p>
              <a href="${signupUrl}" style="display:inline-block;padding:12px 32px;background-color:#059669;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">Sign Up Now</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 24px;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              Use the code above when signing up, or click the button to get started.
              You'll both earn SLE 50 wallet credit when you complete your first booking!
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;text-align:center;">
            <p style="margin:0;color:#cbd5e1;font-size:11px;">© AlphaTek Nexus. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildInviteEmailText(referrerName: string, referralCode: string, signupUrl: string): string {
  return `AlphaTek Nexus - You're Invited!

${referrerName} invited you to join AlphaTek Nexus.

Your referral code: ${referralCode}

Sign up here: ${signupUrl}

You'll both earn SLE 50 wallet credit when you complete your first booking!`;
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

    // ── Auth: derive the referrer from the caller's JWT, not the request body ──
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let referrerId: string;

    if (token.length > 0 && serviceKey.length > 0 && token === serviceKey) {
      // Internal caller must supply referrerId in the body
      const body = await req.json();
      referrerId = body.referrerId;
    } else {
      if (token.length === 0) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !authData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      referrerId = authData.user.id;
    }

    const { recipientEmail, referralCode } = await req.json();

    if (!recipientEmail || !referralCode || !referrerId) {
      return new Response(JSON.stringify({ error: "Missing recipientEmail or referralCode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get referrer profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", referrerId)
      .maybeSingle();

    const referrerName = profile?.full_name || "Someone";
    const signupUrl = `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", "") || ""}?ref=${referralCode}`;
    const appUrl = `https://alphateknexus.com/?ref=${referralCode}`;

    // Create the referral record
    const { data: referral, error: referralErr } = await supabase
      .from("referrals")
      .insert({
        referrer_id: referrerId,
        referral_code: referralCode,
        referred_email: recipientEmail,
      })
      .select()
      .single();

    if (referralErr) {
      if (referralErr.code === "23505") {
        return new Response(JSON.stringify({ error: "This email has already been invited" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Could not create referral record" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send the invitation email via Resend
    let emailSent = false;
    let emailError: string | null = null;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (resendKey) {
      const senders = [
        "AlphaTek Nexus <noreply@alphateknexus.com>",
        "AlphaTek Nexus <onboarding@resend.dev>",
      ];
      for (const from of senders) {
        try {
          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from,
              to: [recipientEmail],
              subject: `${referrerName} invited you to AlphaTek Nexus`,
              html: buildInviteEmailHtml(referrerName, referralCode, appUrl),
              text: buildInviteEmailText(referrerName, referralCode, appUrl),
            }),
          });

          if (resendRes.ok) {
            emailSent = true;
            emailError = null;
            break;
          }
          const body = await resendRes.text();
          // Domain-not-verified / sender rejected → try the next sender
          if (resendRes.status === 422 || resendRes.status === 403) {
            emailError = body;
            continue;
          }
          // Any other failure is not sender-related — stop trying
          emailError = body;
          break;
        } catch (err) {
          emailError = "Email delivery error";
          console.error("Email send error:", err instanceof Error ? err.message : err);
          break;
        }
      }
    } else {
      emailError = "Resend API key not configured";
    }

    // Log the invitation
    await supabase.from("referral_invitations").insert({
      referral_id: referral.id,
      referrer_id: referrerId,
      recipient_email: recipientEmail,
      referral_code: referralCode,
      status: emailSent ? "sent" : "failed",
      error_message: emailError,
    });

    if (!emailSent) {
      return new Response(JSON.stringify({
        success: false,
        error: "Invitation recorded but email delivery failed. Share your referral link manually.",
        referralCreated: true,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Invitation sent to ${recipientEmail}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Referral invite error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Invitation failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
