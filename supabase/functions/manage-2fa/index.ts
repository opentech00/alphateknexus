import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── TOTP helpers (RFC 6238) ──

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(encoded: string): Uint8Array {
  const cleaned = encoded.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(signature);
}

async function generateTOTP(secret: string, timestamp = Date.now()): Promise<string> {
  const counter = Math.floor(timestamp / 1000 / 30);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter & 0xffffffff);
  const key = base32Decode(secret);
  const hmac = await hmacSha1(key, new Uint8Array(buffer));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, "0");
}

function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

async function hashBackupCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes).map(b => (b % 10).toString()).join("");
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

function buildOtpAuthUri(secret: string, email: string): string {
  const issuer = "Alphatek Nexus";
  const account = email;
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

const MAX_TOTP_ATTEMPTS = 5;
const TOTP_LOCKOUT_MINUTES = 10;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Parse body ONCE
    const body = await req.json();
    const { action, code, userId: bodyUserId } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Require auth for all actions
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // User-scoped client for ownership checks
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

    // Service client for privileged operations
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Setup: Generate secret + QR URI ──
    if (action === "setup") {
      const { data: existing } = await adminClient
        .from("user_2fa")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing?.enabled) {
        return new Response(JSON.stringify({ error: "2FA is already enabled. Disable it first to reconfigure." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const secret = generateSecret();
      const otpAuthUri = buildOtpAuthUri(secret, user.email || "user");

      await adminClient.from("user_2fa").upsert({
        user_id: user.id,
        secret,
        enabled: false,
        backup_codes: [],
        totp_attempts: 0,
      }, { onConflict: "user_id" });

      return new Response(JSON.stringify({
        secret,
        otpAuthUri,
        message: "Scan this QR code with your authenticator app, then verify with a 6-digit code.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify: Confirm 2FA setup with a TOTP code ──
    if (action === "verify") {
      if (!code) {
        return new Response(JSON.stringify({ error: "Missing verification code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: config } = await adminClient
        .from("user_2fa")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!config) {
        return new Response(JSON.stringify({ error: "Setup 2FA first" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (config.enabled) {
        return new Response(JSON.stringify({ error: "2FA already enabled" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const expectedCode = await generateTOTP(config.secret);
      if (code !== expectedCode) {
        return new Response(JSON.stringify({ error: "Invalid verification code. Try again." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const backupCodes = generateBackupCodes();
      const hashedCodes = await Promise.all(backupCodes.map(c => hashBackupCode(c)));

      await adminClient.from("user_2fa").update({
        enabled: true,
        enabled_at: new Date().toISOString(),
        backup_codes: hashedCodes,
        totp_attempts: 0,
      }).eq("user_id", user.id);

      return new Response(JSON.stringify({
        success: true,
        backupCodes,
        message: "2FA enabled. Save your backup codes — you won't see them again.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify login: Check TOTP code during login ──
    // Uses the authenticated user's ID — never trusts body userId for ownership
    if (action === "verify-login") {
      if (!code) {
        return new Response(JSON.stringify({ error: "Missing code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Always use the authenticated user's ID, not body userId
      const targetUserId = user.id;

      const { data: config } = await adminClient
        .from("user_2fa")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (!config || !config.enabled) {
        return new Response(JSON.stringify({ error: "2FA not enabled for this account" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Brute-force protection: check attempt count
      const attempts = config.totp_attempts || 0;
      const lockedUntil = config.totp_locked_until ? new Date(config.totp_locked_until) : null;
      const now = new Date();

      if (lockedUntil && lockedUntil > now) {
        const retryAfter = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
        return new Response(JSON.stringify({
          error: "Too many attempts. Try again later.",
          retryAfter,
        }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sentinel check: client uses '__check__' to probe if 2FA is enabled
      if (code === "__check__") {
        return new Response(JSON.stringify({ error: "Invalid code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if it's a backup code
      const hashedInput = await hashBackupCode(code);
      const backupMatch = (config.backup_codes as string[]).indexOf(hashedInput);
      if (backupMatch !== -1) {
        // Consume the backup code and reset attempts
        const remaining = (config.backup_codes as string[]).filter((_, i) => i !== backupMatch);
        await adminClient.from("user_2fa").update({
          backup_codes: remaining,
          totp_attempts: 0,
          totp_locked_until: null,
        }).eq("user_id", targetUserId);
        return new Response(JSON.stringify({ success: true, usedBackupCode: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const expectedCode = await generateTOTP(config.secret);
      if (code !== expectedCode) {
        // Increment attempt counter
        const newAttempts = attempts + 1;
        const shouldLock = newAttempts >= MAX_TOTP_ATTEMPTS;
        await adminClient.from("user_2fa").update({
          totp_attempts: newAttempts,
          totp_locked_until: shouldLock
            ? new Date(now.getTime() + TOTP_LOCKOUT_MINUTES * 60000).toISOString()
            : null,
        }).eq("user_id", targetUserId);

        return new Response(JSON.stringify({
          error: "Invalid code",
          remaining: shouldLock ? 0 : MAX_TOTP_ATTEMPTS - newAttempts,
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Valid code — reset attempts
      await adminClient.from("user_2fa").update({
        totp_attempts: 0,
        totp_locked_until: null,
      }).eq("user_id", targetUserId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Check: Is 2FA enabled for the authenticated user? ──
    if (action === "check") {
      const { data: config } = await adminClient
        .from("user_2fa")
        .select("enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      return new Response(JSON.stringify({ enabled: !!config?.enabled }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Disable: Turn off 2FA — REQUIRES a valid code ──
    if (action === "disable") {
      if (!code) {
        return new Response(JSON.stringify({ error: "A verification code is required to disable 2FA." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: config } = await adminClient
        .from("user_2fa")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!config || !config.enabled) {
        return new Response(JSON.stringify({ error: "2FA not enabled" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify the code — always required, no bypass
      const expectedCode = await generateTOTP(config.secret);
      const hashedInput = await hashBackupCode(code);
      const isBackupCode = (config.backup_codes as string[]).includes(hashedInput);

      if (code !== expectedCode && !isBackupCode) {
        return new Response(JSON.stringify({ error: "Invalid code. 2FA not disabled." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("user_2fa").delete().eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true, message: "2FA disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("2FA error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
