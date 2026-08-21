import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    let payload: { email?: string; password?: string; fullName?: string };
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid account creation request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { email, password, fullName } = payload;

    if (!email || !password || !fullName) {
      return new Response(
        JSON.stringify({ error: "Email, password, and full name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (password.length < 10) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 10 characters" }),
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

    // Create the user via admin API — no confirmation email is sent
    const { data: userData, error: createError } =
      await supabase.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true, // auto-confirm so they can sign in immediately
        user_metadata: { full_name: fullName.trim() },
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

    // Create the profile row (service role bypasses RLS)
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userData.user.id,
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role: "user",
        is_verified: false,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      console.error("create-account: profile insert failed:", profileError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: userData.user.id,
        email: userData.user.email,
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
