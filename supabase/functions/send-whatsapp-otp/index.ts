import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { generateOtpCode, hashPhoneOtp, requireOtpPepper } from "../_shared/otp.ts";
import { sendWhatsAppOtp } from "../_shared/whatsapp.ts";

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone_e164, phone_verified_at")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (!profile?.phone_e164) {
      return json({ error: "No phone number on this account. Add a number first." }, 400);
    }
    if (profile.phone_verified_at) {
      return json({ error: "This phone number is already verified." }, 400);
    }

    const pepper = requireOtpPepper();
    if (!pepper) {
      console.error("send-whatsapp-otp: PHONE_OTP_PEPPER is not configured");
      return json({ error: "Phone verification is not configured. Set PHONE_OTP_PEPPER in Edge Function secrets." }, 500);
    }

    const code = generateOtpCode();
    const codeHash = await hashPhoneOtp(code, profile.phone_e164, pepper);

    const { error: genError } = await supabase.rpc("insert_phone_verification_code", {
      target_phone: profile.phone_e164,
      target_user: authData.user.id,
      target_hash: codeHash,
      target_purpose: "signup",
    });

    if (genError) {
      const isRateLimit = genError.message.toLowerCase().includes("too many");
      return json({ error: genError.message }, isRateLimit ? 429 : 500);
    }

    const sent = await sendWhatsAppOtp(profile.phone_e164, code);
    if (!sent.ok) {
      return json({ error: sent.error }, sent.status);
    }

    return json({ success: true, phone: profile.phone_e164 });
  } catch (err) {
    console.error("send-whatsapp-otp error:", err);
    return json({ error: "Could not send WhatsApp code" }, 500);
  }
});
