import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function parseUserAgent(ua: string): { browser: string; os: string; deviceName: string } {
  let browser = "Unknown";
  let os = "Unknown";

  if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua)) browser = "Safari";

  if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os|macintosh/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ios/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";

  const isMobile = /mobile|android|iphone/i.test(ua);
  const deviceName = `${browser} on ${os}${isMobile ? " (Mobile)" : ""}`;
  return { browser, os, deviceName };
}

function getIp(req: Request): string {
  const headers = [
    "x-forwarded-for", "x-real-ip", "cf-connecting-ip", "x-client-ip",
  ];
  for (const h of headers) {
    const val = req.headers.get(h);
    if (val) return val.split(",")[0].trim();
  }
  return "unknown";
}

function getAuthUser(supabase: any, req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { user: null, token: "" };
  const token = authHeader.replace("Bearer ", "");
  return { token, userPromise: supabase.auth.getUser(token) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userAgent = req.headers.get("User-Agent") || "Unknown";
    const ip = getIp(req);
    const { browser, os, deviceName } = parseUserAgent(userAgent);

    // ── Check lockout status for an email ──
    if (action === "check-lockout") {
      const { email } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: "Missing email" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: userData } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (!userData) {
        return new Response(JSON.stringify({ locked: false, attempts: 0, lockedUntil: null, remaining: MAX_ATTEMPTS, retryAfter: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: lockout } = await supabase
        .from("auth_lockout")
        .select("*")
        .eq("user_id", userData.id)
        .maybeSingle();

      if (!lockout) {
        return new Response(JSON.stringify({ locked: false, attempts: 0, lockedUntil: null, remaining: MAX_ATTEMPTS, retryAfter: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const now = new Date();
      const lockedUntil = lockout.locked_until ? new Date(lockout.locked_until) : null;
      const isLocked = lockedUntil && lockedUntil > now;

      return new Response(JSON.stringify({
        locked: !!isLocked,
        lockedUntil: lockout.locked_until,
        attempts: lockout.failed_attempts,
        remaining: isLocked ? 0 : MAX_ATTEMPTS - lockout.failed_attempts,
        retryAfter: isLocked ? Math.ceil((lockedUntil!.getTime() - now.getTime()) / 1000) : 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Record failed login attempt ──
    if (action === "record-failure") {
      const { email } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: "Missing email" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: userData } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (!userData) {
        return new Response(JSON.stringify({ locked: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = userData.id;

      const { data: existing } = await supabase
        .from("auth_lockout")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      const newAttempts = (existing?.failed_attempts || 0) + 1;
      const shouldLock = newAttempts >= MAX_ATTEMPTS;
      const now = new Date();

      if (existing) {
        await supabase.from("auth_lockout").update({
          failed_attempts: newAttempts,
          locked_until: shouldLock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000).toISOString() : existing.locked_until,
          last_failed_at: now.toISOString(),
          updated_at: now.toISOString(),
        }).eq("user_id", userId);
      } else {
        await supabase.from("auth_lockout").insert({
          user_id: userId,
          failed_attempts: newAttempts,
          locked_until: shouldLock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000).toISOString() : null,
          last_failed_at: now.toISOString(),
        });
      }

      await supabase.from("login_activity").insert({
        user_id: userId,
        event_type: "login_failed",
        ip_address: ip,
        user_agent: userAgent,
        device_name: deviceName,
        success: false,
        error_message: "Invalid credentials",
      });

      return new Response(JSON.stringify({
        locked: shouldLock,
        attempts: newAttempts,
        remaining: shouldLock ? 0 : MAX_ATTEMPTS - newAttempts,
        lockedUntil: shouldLock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000).toISOString() : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Record successful login (reset lockout + log + register session) ──
    if (action === "record-success") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("auth_lockout").delete().eq("user_id", user.id);

      let sessionId = "unknown";
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        sessionId = payload.jti || payload.session_id || "unknown";
      } catch { /* ignore */ }

      await supabase.from("login_activity").insert({
        user_id: user.id,
        event_type: "login_success",
        ip_address: ip,
        user_agent: userAgent,
        device_name: deviceName,
        session_id: sessionId,
        success: true,
      });

      await supabase.from("active_sessions").update({ is_current: false }).eq("user_id", user.id);
      await supabase.from("active_sessions").upsert({
        user_id: user.id,
        session_token: sessionId,
        device_name: deviceName,
        browser,
        os,
        ip_address: ip,
        is_current: true,
        last_active_at: new Date().toISOString(),
      }, { onConflict: "session_token" });

      // ── New Device Login Alert ──
      const ipSubnet = ip.split(".").slice(0, 3).join(".");
      const deviceHashInput = `${userAgent}|${ipSubnet}`;
      const deviceHashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(deviceHashInput));
      const deviceHash = Array.from(new Uint8Array(deviceHashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

      const { data: existingDevice } = await supabase
        .from("recognized_devices")
        .select("id")
        .eq("user_id", user.id)
        .eq("device_hash", deviceHash)
        .maybeSingle();

      const isNewDevice = !existingDevice;

      if (isNewDevice) {
        await supabase.from("recognized_devices").insert({
          user_id: user.id,
          device_hash: deviceHash,
          device_name: deviceName,
          browser,
          os,
          ip_address: ip,
        });
      } else {
        await supabase.from("recognized_devices").update({
          last_seen_at: new Date().toISOString(),
        }).eq("user_id", user.id).eq("device_hash", deviceHash);
      }

      if (isNewDevice) {
        const alertTitle = `New login from ${deviceName}`;
        const alertBody = `A new sign-in was detected on ${deviceName} at ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. IP: ${ip}. If this was you, no action is needed. If not, please secure your account immediately.`;

        await supabase.from("notification_outbox").insert({
          user_id: user.id,
          event_type: "security_new_device",
          title: alertTitle,
          body: alertBody,
          category: "system",
          channels: ["email", "push"],
          status: "pending",
        });
      }

      return new Response(JSON.stringify({ success: true, isNewDevice }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Record 2FA event ──
    if (action === "record-2fa") {
      const { userId, success: twoSuccess } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing userId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("login_activity").insert({
        user_id: userId,
        event_type: twoSuccess ? "2fa_success" : "2fa_failed",
        ip_address: ip,
        user_agent: userAgent,
        device_name: deviceName,
        success: twoSuccess,
        error_message: twoSuccess ? null : "Invalid 2FA code",
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── List active sessions ──
    if (action === "list-sessions") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: sessions } = await supabase
        .from("active_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("last_active_at", { ascending: false });

      return new Response(JSON.stringify({ sessions: sessions || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Revoke a session ──
    if (action === "revoke-session") {
      const { sessionToken } = body;
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("active_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("session_token", sessionToken);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Revoke ALL sessions except current ──
    if (action === "revoke-all-sessions") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete all sessions for this user that are NOT the current one
      await supabase.from("active_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("is_current", false);

      // Log the event
      await supabase.from("login_activity").insert({
        user_id: user.id,
        event_type: "revoke_all_sessions",
        ip_address: ip,
        user_agent: userAgent,
        device_name: deviceName,
        success: true,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Check for failed login attempts since last success ──
    if (action === "check-failed-since-last-success") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the most recent login_success event (excluding the current one - get 2nd most recent)
      const { data: successEvents } = await supabase
        .from("login_activity")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("event_type", "login_success")
        .order("created_at", { ascending: false })
        .limit(2);

      // Use the 2nd most recent success (the one before this login) as the baseline
      const prevSuccessDate = successEvents && successEvents.length > 1
        ? successEvents[1].created_at
        : null;

      // Find any failed attempts after that success
      let failQuery = supabase
        .from("login_activity")
        .select("created_at, device_name")
        .eq("user_id", user.id)
        .eq("event_type", "login_failed")
        .order("created_at", { ascending: false })
        .limit(1);

      if (prevSuccessDate) {
        failQuery = failQuery.gt("created_at", prevSuccessDate);
      }

      const { data: failedEvents } = await failQuery;

      if (failedEvents && failedEvents.length > 0) {
        return new Response(JSON.stringify({
          hasFailedAttempts: true,
          lastFailedAt: failedEvents[0].created_at,
          lastFailedDevice: failedEvents[0].device_name || "Unknown device",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ hasFailedAttempts: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── List login activity (audit log) ──
    if (action === "list-activity") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: activity } = await supabase
        .from("login_activity")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      return new Response(JSON.stringify({ activity: activity || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auth events error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Request failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
