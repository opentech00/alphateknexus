import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

function buildEmailHtml(title: string, body: string, subtitle: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">AlphaTek Nexus</h1>
<p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">${subtitle}</p>
</td></tr>
<tr><td style="padding:32px 40px 0;text-align:center;">
<h2 style="margin:0 0 4px;color:#0f172a;font-size:20px;font-weight:700;">${title}</h2>
<p style="margin:0;color:#64748b;font-size:14px;">${body}</p>
</td></tr>
<tr><td style="padding:0 40px 32px;text-align:center;">
<p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">This is an automated message. No reply is needed.<br/>Log in to your AlphaTek Nexus portal for details.</p>
<p style="margin:16px 0 0;color:#cbd5e1;font-size:11px;">&copy; AlphaTek Nexus. All rights reserved.</p>
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
  const prefix = "AlphaTek Nexus";
  if (eventType.startsWith("booking")) return `${title} - ${prefix}`;
  if (eventType.startsWith("payment") || eventType.startsWith("wallet") || eventType.startsWith("withdrawal"))
    return `${title} - ${prefix}`;
  if (eventType.startsWith("job") || eventType.startsWith("field")) return `${title} - ${prefix}`;
  if (eventType.startsWith("hr") || eventType.startsWith("employee")) return `${title} - ${prefix}`;
  if (eventType.startsWith("incident")) return `${title} - ${prefix}`;
  if (eventType.startsWith("smart_sort") || eventType.startsWith("subscription"))
    return `${title} - ${prefix}`;
  if (eventType.startsWith("announcement")) return `${title} - ${prefix}`;
  return `${title} - ${prefix}`;
}

async function sendEmail(
  supabase: ReturnType<typeof createClient>,
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

async function sendPushToToken(
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
        aps: {
          sound: "default",
          badge: 1,
        },
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Process mode: poll the outbox for unprocessed rows
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "process";

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

        // Fetch user preferences
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

            // Deactivate invalid tokens
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

        // Mark as processed
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
        JSON.stringify({
          success: true,
          processed: results.length,
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Direct send mode: send a notification immediately without the outbox
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

      // Immediately process this single row
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
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
