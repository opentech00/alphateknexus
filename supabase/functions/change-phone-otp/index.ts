import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { normalizePhone } from "../_shared/phone.ts";
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

    let payload: { action?: string; phone?: string; code?: string };
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }

    const action = payload.action;
    if (action !== "send" && action !== "verify") {
      return json({ error: "Invalid action" }, 400);
    }

    const normalized = normalizePhone(payload.phone || "");
    if (!normalized.ok) {
      return json({ error: normalized.error }, 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone_e164, phone_verified_at")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profile?.phone_e164 === normalized.value.e164 && profile.phone_verified_at) {
      return json({ success: true, unchanged: true, phone: normalized.value.e164 });
    }

    const { data: taken } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone_e164", normalized.value.e164)
      .neq("id", authData.user.id)
      .maybeSingle();

    if (taken) {
      return json({ error: "That phone number is already used by another account." }, 409);
    }

    const pepper = requireOtpPepper();
    if (!pepper) {
      console.error("change-phone-otp: PHONE_OTP_PEPPER is not configured");
      return json({ error: "Phone verification is not configured." }, 500);
    }

    if (action === "send") {
      const code = generateOtpCode();
      const codeHash = await hashPhoneOtp(code, normalized.value.e164, pepper);
      const { error: genError } = await supabase.rpc("insert_phone_verification_code", {
        target_phone: normalized.value.e164,
        target_user: authData.user.id,
        target_hash: codeHash,
        target_purpose: "change_phone",
      });
      if (genError) {
        const isRateLimit = genError.message.toLowerCase().includes("too many");
        return json({ error: genError.message }, isRateLimit ? 429 : 500);
      }
      const sent = await sendWhatsAppOtp(normalized.value.e164, code);
      if (!sent.ok) return json({ error: sent.error }, sent.status);
      return json({ success: true, phone: normalized.value.e164 });
    }

    const code = payload.code;
    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return json({ error: "Please enter a valid 6-digit code" }, 400);
    }

    const codeHash = await hashPhoneOtp(code, normalized.value.e164, pepper);
    const { data: verifyResult, error: verifyError } = await supabase.rpc(
      "verify_phone_verification_code",
      {
        target_phone: normalized.value.e164,
        target_user: authData.user.id,
        target_hash: codeHash,
        target_purpose: "change_phone",
      },
    );

    if (verifyError) return json({ error: verifyError.message }, 400);
    if (!verifyResult) return json({ error: "Verification failed" }, 400);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        phone: normalized.value.display,
        phone_e164: normalized.value.e164,
        phone_verified_at: new Date().toISOString(),
      })
      .eq("id", authData.user.id);

    if (updateError) {
      const dup = updateError.message.toLowerCase().includes("phone") || updateError.code === "23505";
      if (dup) return json({ error: "That phone number is already used by another account." }, 409);
      console.error("change-phone-otp: profile update failed:", updateError.message);
      return json({ error: "Could not update phone number. Please try again." }, 500);
    }

    return json({ success: true, verified: true, phone: normalized.value.e164 });
  } catch (err) {
    console.error("change-phone-otp error:", err);
    return json({ error: "Could not update phone number" }, 500);
  }
});
