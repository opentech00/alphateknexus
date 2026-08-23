import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MIN_LENGTH = 10;
const MAX_HISTORY = 3;

function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_LENGTH} characters long` };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must include at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must include at least one lowercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must include at least one number" };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, error: "Password must include at least one special character" };
  }
  return { valid: true };
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { action, newPassword, currentPassword } = body;

    // ── Check: Validate password strength without changing ──
    if (action === "validate") {
      const result = validatePasswordStrength(newPassword || "");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Change: Update password with full validation ──
    if (action === "change") {
      if (!newPassword) {
        return new Response(JSON.stringify({ error: "New password is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 1: Validate strength
      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return new Response(JSON.stringify({ error: strength.error }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 2: Check password history (if currentPassword provided, verify it first)
      if (currentPassword) {
        const { error: verifyError } = await userClient.auth.signInWithPassword({
          email: user.email || "",
          password: currentPassword,
        });
        if (verifyError) {
          return new Response(JSON.stringify({ error: "Current password is incorrect" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const newHash = await hashPassword(newPassword);

      // Check against history
      const { data: history } = await adminClient
        .from("password_history")
        .select("password_hash")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY);

      if (history) {
        for (const entry of history) {
          if (entry.password_hash === newHash) {
            return new Response(JSON.stringify({
              error: "This password was used recently. Please choose a different password.",
            }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      // Update the password
      const { error: updateError } = await userClient.auth.updateUser({ password: newPassword });
      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save to history
      await adminClient.from("password_history").insert({
        user_id: user.id,
        password_hash: newHash,
      });

      // Clean up old entries — keep only the most recent MAX_HISTORY
      if (history && history.length >= MAX_HISTORY - 1) {
        const { data: allHistory } = await adminClient
          .from("password_history")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (allHistory && allHistory.length > MAX_HISTORY) {
          const idsToDelete = allHistory.slice(MAX_HISTORY).map((h: { id: string }) => h.id);
          await adminClient.from("password_history")
            .delete()
            .in("id", idsToDelete);
        }
      }

      await adminClient.rpc("enqueue_notification", {
        p_user_id: user.id,
        p_recipient_role: "client",
        p_event_type: "password_changed",
        p_title: "Password changed successfully",
        p_body: "Your AlphaTek Nexus password was changed successfully. If you did not make this change, contact support immediately.",
        p_category: "system",
        p_metadata: { action: "password_changed" },
      });

      await adminClient.rpc("enqueue_admin_notification", {
        p_event_type: "user_password_changed",
        p_title: "User password changed",
        p_body: `${user.email || "A user"} changed their account password.`,
        p_category: "system",
        p_metadata: { user_id: user.id, action: "password_changed" },
      });

      return new Response(JSON.stringify({ success: true, message: "Password updated successfully" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Password management error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
