import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Only internal callers (service role key, e.g. scheduled jobs, other edge
// functions or database webhooks) may enqueue or dispatch notifications.
function isInternalCaller(req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (token.length === 0) return false;
  if (serviceKey.length > 0 && token === serviceKey) return true;
  return false;
}

// The cron job (pg_net) calls mode=process with the anon key.
// This is safe: process mode only reads the outbox and dispatches
// notifications — it does not expose any user data.
function isProcessCaller(req: Request): boolean {
  if (isInternalCaller(req)) return true;
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (token.length === 0 || anonKey.length === 0) return false;
  return token === anonKey;
}

interface OutboxRow {
  id: string;
  user_id: string;
  recipient_role: string;
  event_type: string;
  title: string;
  body: string;
  category: string;
  metadata: Record<string, unknown>;
}

interface NotificationPreferences {
  email_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  cat_bookings: boolean;
  cat_payments: boolean;
  cat_messages: boolean;
  cat_field_dispatch: boolean;
  cat_hr: boolean;
  cat_incidents: boolean;
  cat_smart_sort: boolean;
  cat_system: boolean;
}

interface PushSubscription {
  id: string;
  token: string;
  platform: string;
  app_role: string;
}

const CATEGORY_MAP: Record<string, keyof NotificationPreferences> = {
  bookings: "cat_bookings",
  payments: "cat_payments",
  messages: "cat_messages",
  field_dispatch: "cat_field_dispatch",
  hr: "cat_hr",
  incidents: "cat_incidents",
  smart_sort: "cat_smart_sort",
  system: "cat_system",
};

// ── FCM HTTP v1 helpers ──────────────────────────────────────────

interface ServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.project_id || !sa.private_key || !sa.client_email) return null;
    return sa;
  } catch {
    return null;
  }
}

function base64UrlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer as ArrayBuffer;
}

async function signJwtWithRsa(privateKeyPem: string, payload: Record<string, unknown>): Promise<string> {
  // Parse PKCS#8 PEM private key
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const header = { alg: "RS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(strToArrayBuffer(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(strToArrayBuffer(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    strToArrayBuffer(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwtWithRsa(sa.private_key, {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OAuth2 token fetch failed: ${errText}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function sendPushV1(
  projectId: string,
  accessToken: string,
  token: string,
  platform: string,
  title: string,
  body: string,
  metadata: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const message: Record<string, unknown> = {
    token,
    notification: { title, body },
    data: {
      ...Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [k, String(v)]),
      ),
      title,
      body,
      click_action: String(metadata.click_action || "OPEN_APP"),
    },
    android: {
      notification: {
        channel_id: String(metadata.channel_id || "general"),
        priority: "high",
      },
    },
    apns: {
      payload: {
        aps: { sound: "default", badge: 1 },
      },
    },
  };

  if (platform === "web") {
    message["webpush"] = {
      notification: { title, body, icon: "/alphateknexus_logo.png" },
      fcm_options: { link: String(metadata.link || "/") },
    };
  }

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      // Check for unregistered/invalid token
      if (errText.includes("UNREGISTERED") || errText.includes("invalid-registration-token")) {
        return { ok: false, error: "InvalidRegistration" };
      }
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function sendPushLegacy(
  token: string,
  platform: string,
  title: string,
  body: string,
  metadata: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const fcmServerKey = Deno.env.get("FCM_SERVER_KEY");
  if (!fcmServerKey) {
    return { ok: false, error: "FCM_SERVER_KEY not configured" };
  }

  const message: Record<string, unknown> = {
    notification: { title, body },
    data: {
      ...metadata,
      title,
      body,
      click_action: metadata.click_action?.toString() || "OPEN_APP",
    },
    android: {
      notification: {
        channel_id: metadata.channel_id?.toString() || "general",
        priority: "high",
      },
    },
    apns: {
      payload: {
        aps: { sound: "default", badge: 1 },
      },
    },
  };

  if (platform === "web") {
    message["webpush"] = {
      notification: { title, body, icon: "/alphateknexus_logo.png" },
      fcm_options: { link: metadata.link?.toString() || "/" },
    };
  }

  try {
    const res = await fetch(`https://fcm.googleapis.com/fcm/send`, {
      method: "POST",
      headers: {
        Authorization: `key=${fcmServerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: token, ...message }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText };
    }

    const data = await res.json();
    if (data.failure > 0 && data.results?.[0]?.error === "InvalidRegistration") {
      return { ok: false, error: "InvalidRegistration" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function sendPushToToken(
  token: string,
  platform: string,
  title: string,
  body: string,
  metadata: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const sa = getServiceAccount();
  if (sa) {
    try {
      const accessToken = await getFcmAccessToken(sa);
      return await sendPushV1(sa.project_id, accessToken, token, platform, title, body, metadata);
    } catch (err) {
      // Fall back to legacy if v1 fails for any reason
      console.error("FCM v1 failed, falling back to legacy:", (err as Error).message);
    }
  }
  return sendPushLegacy(token, platform, title, body, metadata);
}

// ── Email helpers ───────────────────────────────────────────────

function buildEmailHtml(title: string, body: string, subtitle: string): string {
  const appUrl = (Deno.env.get("APP_URL") || "https://alphateknexus.com").replace(/\/$/, "");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f6;padding:32px 12px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #dbe3ea;border-radius:14px;overflow:hidden;">
<tr><td style="height:5px;background:#10b981;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 36px 22px;border-bottom:1px solid #edf1f5;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td><img src="${appUrl}/alphateknexus_logo.png" width="42" height="42" alt="AlphaTek Nexus" style="display:block;border-radius:10px;"></td>
<td style="padding-left:12px;"><strong style="display:block;color:#0f172a;font-size:17px;">AlphaTek Nexus</strong><span style="display:block;margin-top:3px;color:#64748b;font-size:12px;">${subtitle}</span></td>
</tr></table>
</td></tr>
<tr><td style="padding:34px 36px 30px;">
<p style="margin:0 0 10px;color:#10b981;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Account notification</p>
<h1 style="margin:0 0 12px;color:#0f172a;font-size:24px;line-height:1.25;">${title}</h1>
<p style="margin:0;color:#475569;font-size:15px;line-height:1.65;">${body}</p>
</td></tr>
<tr><td style="padding:20px 36px;background:#f8fafc;border-top:1px solid #edf1f5;">
<p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated message from AlphaTek Nexus.<br>Sign in to your portal for more details. No reply is needed.</p>
<p style="margin:12px 0 0;color:#94a3b8;font-size:11px;">&copy; AlphaTek Nexus. All rights reserved.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildEmailText(title: string, body: string): string {
  return `AlphaTek Nexus\n\n${title}\n${body}\n\nThis is an automated message. No reply is needed.`;
}

function getSubjectForEvent(eventType: string, title: string): string {
  return `${title} - AlphaTek Nexus`;
}

async function sendEmail(
  _supabase: ReturnType<typeof createClient>,
  recipientEmail: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AlphaTek Nexus <noreply@alphateknexus.com>",
        to: [recipientEmail],
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Main handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "process";

  // mode=process is safe to call without authentication — it only reads
  // the outbox queue (populated by trusted database triggers) and
  // dispatches pending notifications. No user data is exposed.
  // mode=direct requires the service role key.
  if (mode === "direct" && !isInternalCaller(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (mode === "process") {
      const batchSize = parseInt(url.searchParams.get("batch") || "20", 10);

      const { data: outboxRows, error: fetchErr } = await supabase
        .from("notification_outbox")
        .select("*")
        .is("processed_at", null)
        .order("created_at", { ascending: true })
        .limit(batchSize);

      if (fetchErr) {
        return new Response(JSON.stringify({ error: fetchErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!outboxRows || outboxRows.length === 0) {
        return new Response(
          JSON.stringify({ success: true, processed: 0, message: "No pending notifications" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const results: Array<{ id: string; in_app: boolean; email: boolean; push: boolean; errors: string[] }> = [];

      for (const row of outboxRows as unknown as OutboxRow[]) {
        const errors: string[] = [];
        let inAppSent = false;
        let emailSent = false;
        let pushSent = false;
        let inAppSkipped = false;
        let emailSkipped = false;
        let pushSkipped = false;

        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select("*")
          .eq("user_id", row.user_id)
          .maybeSingle();

        const userPrefs = (prefs || {}) as NotificationPreferences;
        const categoryKey = CATEGORY_MAP[row.category] || "cat_system";
        const categoryEnabled = userPrefs[categoryKey] !== false;

        // ── In-app notification ──
        if (categoryEnabled && userPrefs.in_app_enabled !== false) {
          const { error: inAppErr } = await supabase.from("notifications").insert({
            user_id: row.user_id,
            title: row.title,
            body: row.body,
            type: row.event_type.startsWith("booking") ? "booking_update"
              : row.event_type.startsWith("message") ? "message"
              : row.event_type.startsWith("job") || row.event_type.startsWith("field") ? "field_dispatch"
              : row.event_type.startsWith("hr") || row.event_type.startsWith("employee") ? "hr_update"
              : row.event_type.startsWith("payment") || row.event_type.startsWith("wallet") ? "payment"
              : row.event_type.startsWith("incident") ? "incident"
              : row.event_type.startsWith("review") ? "review_prompt"
              : row.event_type.startsWith("subscription") || row.event_type.startsWith("smart_sort") ? "subscription"
              : "system",
            recipient_role: row.recipient_role,
            booking_id: (row.metadata as Record<string, string>).booking_id || null,
            service_slug: (row.metadata as Record<string, string>).service_slug || null,
            metadata: row.metadata,
          });

          if (inAppErr) {
            errors.push(`in_app: ${inAppErr.message}`);
          } else {
            inAppSent = true;
          }
        } else {
          inAppSkipped = true;
        }

        // ── Email notification ──
        if (categoryEnabled && userPrefs.email_enabled !== false) {
          const { data: userData } = await supabase.auth.admin.getUserById(row.user_id);
          const recipientEmail = userData?.user?.email;

          if (recipientEmail) {
            const subject = getSubjectForEvent(row.event_type, row.title);
            const html = buildEmailHtml(row.title, row.body, row.event_type.replace(/_/g, " "));
            const text = buildEmailText(row.title, row.body);
            const emailResult = await sendEmail(supabase, recipientEmail, subject, html, text);

            if (emailResult.ok) {
              emailSent = true;
            } else {
              errors.push(`email: ${emailResult.error}`);
            }
          } else {
            emailSkipped = true;
          }
        } else {
          emailSkipped = true;
        }

        // ── Push notification ──
        if (categoryEnabled && userPrefs.push_enabled !== false) {
          const { data: subs } = await supabase
            .from("push_subscriptions")
            .select("id, token, platform, app_role")
            .eq("user_id", row.user_id)
            .eq("is_active", true);

          if (subs && subs.length > 0) {
            let anyPushSent = false;
            const invalidTokens: string[] = [];

            for (const sub of subs as unknown as PushSubscription[]) {
              const pushResult = await sendPushToToken(
                sub.token,
                sub.platform,
                row.title,
                row.body,
                row.metadata,
              );
              if (pushResult.ok) {
                anyPushSent = true;
              } else if (pushResult.error === "InvalidRegistration") {
                invalidTokens.push(sub.id);
              } else {
                errors.push(`push[${sub.id}]: ${pushResult.error}`);
              }
            }

            if (anyPushSent) pushSent = true;

            for (const subId of invalidTokens) {
              await supabase
                .from("push_subscriptions")
                .update({ is_active: false })
                .eq("id", subId);
            }
          } else {
            pushSkipped = true;
          }
        } else {
          pushSkipped = true;
        }

        const errorMessage = errors.length > 0 ? errors.join("; ") : null;
        await supabase
          .from("notification_outbox")
          .update({
            in_app_sent: inAppSent,
            email_sent: emailSent,
            push_sent: pushSent,
            in_app_skipped: inAppSkipped,
            email_skipped: emailSkipped,
            push_skipped: pushSkipped,
            error_message: errorMessage,
            processed_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        results.push({
          id: row.id,
          in_app: inAppSent,
          email: emailSent,
          push: pushSent,
          errors,
        });
      }

      return new Response(
        JSON.stringify({ success: true, processed: results.length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "direct") {
      const body = await req.json();
      const {
        userId,
        recipientRole,
        eventType,
        title,
        body: notifBody,
        category = "system",
        metadata = {},
      } = body as Record<string, unknown>;

      if (!userId || !title || !notifBody) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: userId, title, body" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: outboxId } = await supabase.rpc("enqueue_notification", {
        p_user_id: userId,
        p_recipient_role: recipientRole || "client",
        p_event_type: eventType || "system",
        p_title: title,
        p_body: notifBody,
        p_category: category,
        p_metadata: metadata,
      });

      const { data: row } = await supabase
        .from("notification_outbox")
        .select("*")
        .eq("id", outboxId)
        .maybeSingle();

      if (!row) {
        return new Response(
          JSON.stringify({ error: "Failed to enqueue notification" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, outboxId, message: "Notification enqueued. Run process mode to dispatch." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown mode. Use ?mode=process or ?mode=direct" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-notification failure:", err);
    return new Response(
      JSON.stringify({ error: "Notification dispatch failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
