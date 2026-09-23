import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { normalizePhone } from "../_shared/phone.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    let payload: { email?: string; password?: string; fullName?: string; phone?: string };
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid account creation request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { email, password, fullName, phone } = payload;

    if (!email || !password || !fullName) {
      return new Response(
        JSON.stringify({ error: "Email, password, and full name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "A valid phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (password.length < 10) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 10 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalized = normalizePhone(phone);
    if (!normalized.ok) {
      return new Response(
        JSON.stringify({ error: normalized.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("create-account: missing Supabase environment variables");
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: missing Supabase environment variables" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: portal } = await supabase
      .from("app_settings")
      .select("registration_enabled")
      .eq("id", 1)
      .maybeSingle();

    if (portal && portal.registration_enabled === false) {
      return new Response(
        JSON.stringify({ error: "New registrations are currently closed. Please sign in if you already have an account." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: existingPhone } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone_e164", normalized.value.e164)
      .maybeSingle();

    if (existingPhone) {
      return new Response(
        JSON.stringify({ error: "An account with this phone number already exists. Please sign in instead." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: userData, error: createError } =
      await supabase.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName.trim(), phone: normalized.value.e164 },
      });

    if (createError) {
      const msg = createError.message.toLowerCase();
      if (msg.includes("already") || msg.includes("exists") || msg.includes("duplicate")) {
        return new Response(
          JSON.stringify({ error: "An account with this email already exists. Please sign in instead." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.error("create-account: createUser failed:", createError.message);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!userData.user) {
      return new Response(
        JSON.stringify({ error: "Account creation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userData.user.id,
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role: "user",
        is_verified: false,
        phone: normalized.value.display,
        phone_e164: normalized.value.e164,
        phone_verified_at: null,
        phone_verification_required: false,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      const dup = profileError.message.toLowerCase().includes("phone") || profileError.code === "23505";
      await supabase.auth.admin.deleteUser(userData.user.id);
      if (dup) {
        return new Response(
          JSON.stringify({ error: "An account with this phone number already exists. Please sign in instead." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.error("create-account: profile insert failed:", profileError.message);
      return new Response(
        JSON.stringify({ error: "Account was created but profile setup failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: userData.user.id,
        email: userData.user.email,
        phone: normalized.value.e164,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-account error:", err);
    return new Response(
      JSON.stringify({ error: "Could not create account" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
