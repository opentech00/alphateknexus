import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return new Response(JSON.stringify({ error: "Password confirmation is required to delete your account." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userToken = authHeader.replace("Bearer ", "");

    // User-scoped client for password verification
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step-up auth: verify password by re-signing in
    const { error: signInErr } = await userClient.auth.signInWithPassword({
      email: user.email!,
      password,
    });
    if (signInErr) {
      return new Response(JSON.stringify({ error: "Password is incorrect. Account not deleted." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const userId = user.id;

    // 1. Delete storage files (avatars + documents)
    for (const bucket of ["avatars", "documents"]) {
      const { data: files } = await adminClient.storage.from(bucket).list();
      if (files && files.length > 0) {
        // List files in the user's folder if bucket is organized by user_id
        const userFiles = files.filter((f: any) => !f.metadata);
        if (userFiles.length > 0) {
          await adminClient.storage.from(bucket).remove(
            userFiles.map((f: any) => `${userId}/${f.name}`)
          );
        }
      }
    }

    // 2. Delete the auth user FIRST — FK ON DELETE CASCADE handles most tables
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteErr) {
      return new Response(JSON.stringify({ error: "Failed to delete user account" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Clean up straggler tables that may not have FK cascade
    // messages keyed by sender_id, booking_status_history keyed by booking_id
    await adminClient.from("messages").delete().eq("sender_id", userId);
    await adminClient.from("referral_invitations").delete().eq("referrer_id", userId);

    // Delete booking_status_history via booking_ids
    const { data: userBookings } = await adminClient
      .from("bookings")
      .select("id")
      .eq("user_id", userId);
    if (userBookings && userBookings.length > 0) {
      const bookingIds = userBookings.map((b: any) => b.id);
      await adminClient.from("booking_status_history").delete().in("booking_id", bookingIds);
      await adminClient.from("bookings").delete().eq("user_id", userId);
    }

    // Delete profile if it still exists (no FK cascade)
    await adminClient.from("profiles").delete().eq("id", userId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
