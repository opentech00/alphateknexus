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
    const { targetUserId } = body;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "Target user ID is required" }), {
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

    // Verify the caller is an admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can delete user accounts" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-deletion
    if (user.id === targetUserId) {
      return new Response(JSON.stringify({ error: "You cannot delete your own admin account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Delete storage files (avatars + documents)
    for (const bucket of ["avatars", "documents"]) {
      const { data: files } = await adminClient.storage.from(bucket).list();
      if (files && files.length > 0) {
        const userFiles = files.filter((f: any) => !f.metadata);
        if (userFiles.length > 0) {
          await adminClient.storage.from(bucket).remove(
            userFiles.map((f: any) => `${targetUserId}/${f.name}`)
          );
        }
      }
    }

    // 2. Delete the auth user — FK ON DELETE CASCADE handles profiles and most tables
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteErr) {
      return new Response(JSON.stringify({ error: "Failed to delete user account" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Clean up straggler tables that may not have FK cascade
    await adminClient.from("messages").delete().eq("sender_id", targetUserId);
    await adminClient.from("referral_invitations").delete().eq("referrer_id", targetUserId);

    // Delete employee record linked to this user (if any)
    const { data: empRecord } = await adminClient
      .from("employees")
      .select("id, photo_url, resume_url")
      .eq("user_id", targetUserId);
    if (empRecord && empRecord.length > 0) {
      const emp = empRecord[0] as any;
      // Clean up employee storage files
      if (emp.photo_url) {
        try {
          const photoPath = emp.photo_url.split("/").pop();
          if (photoPath) await adminClient.storage.from("employee-photos").remove([photoPath]);
        } catch { /* best-effort */ }
      }
      if (emp.resume_url) {
        try { await adminClient.storage.from("employee-resumes").remove([emp.resume_url]); } catch { /* best-effort */ }
      }
      // Delete employee activity logs and ID cards
      await adminClient.from("employee_activity_logs").delete().eq("employee_id", emp.id);
      await adminClient.from("employee_id_cards").delete().eq("employee_id", emp.id);
      await adminClient.from("employees").delete().eq("id", emp.id);
    }

    // Delete booking_status_history via booking_ids
    const { data: userBookings } = await adminClient
      .from("bookings")
      .select("id")
      .eq("user_id", targetUserId);
    if (userBookings && userBookings.length > 0) {
      const bookingIds = userBookings.map((b: any) => b.id);
      await adminClient.from("booking_status_history").delete().in("booking_id", bookingIds);
      await adminClient.from("bookings").delete().eq("user_id", targetUserId);
    }

    // Delete profile if it still exists (no FK cascade in some setups)
    await adminClient.from("profiles").delete().eq("id", targetUserId);

    // 4. Log the action in audit log
    await adminClient.from("admin_audit_log").insert({
      admin_id: user.id,
      target_user_id: targetUserId,
      action: "delete",
      details: { method: "admin_edge_function" },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
