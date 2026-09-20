import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { hashPhoneOtp, requireOtpPepper } from "../_shared/otp.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    if (!token) return json({ error: "Unauthorized" }, 401);

    const { data: authData } = await supabase.auth.getUser(token);
    if (!authData?.user) return json({ error: "Unauthorized" }, 401);

    let body: { code?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Please enter a valid 6-digit code" }, 400);
    }

    const code = body.code;
    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return json({ error: "Please enter a valid 6-digit code" }, 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone_e164, phone_verified_at")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (!profile?.phone_e164) {
      return json({ error: "No phone number on this account." }, 400);
    }
    if (profile.phone_verified_at) {
      return json({ success: true, verified: true });
    }

    const pepper = requireOtpPepper();
    if (!pepper) {
      console.error("verify-whatsapp-otp: PHONE_OTP_PEPPER is not configured");
      return json({ error: "Phone verification is not configured." }, 500);
    }

    const codeHash = await hashPhoneOtp(code, profile.phone_e164, pepper);
    const { data: verifyResult, error: verifyError } = await supabase.rpc(
      "verify_phone_verification_code",
      {
        target_phone: profile.phone_e164,
        target_user: authData.user.id,
        target_hash: codeHash,
        target_purpose: "signup",
      },
    );

    if (verifyError) {
      return json({ error: verifyError.message }, 400);
    }
    if (!verifyResult) {
      return json({ error: "Verification failed" }, 400);
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ phone_verified_at: new Date().toISOString() })
      .eq("id", authData.user.id);

    if (profileError) {
      console.error("verify-whatsapp-otp: failed to update profile:", profileError.message);
      return json({ error: "Failed to complete verification. Please try again." }, 500);
    }

    return json({ success: true, verified: true });
  } catch (err) {
    console.error("verify-whatsapp-otp error:", err);
    return json({ error: "Could not verify phone" }, 500);
  }
});
