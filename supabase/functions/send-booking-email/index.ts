import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailPayload {
  eventType: "booking_confirmation" | "status_update" | "review_prompt" | "referral_invite";
  bookingId?: string;
  recipientEmail?: string;
  userId?: string;
  status?: string;
  serviceName?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  location?: string;
  referrerName?: string;
  referralCode?: string;
  inviteeEmail?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildEmailHtml(opts: {
  title: string;
  subtitle: string;
  bodyTitle: string;
  bodyText: string;
  details: { label: string; value: string }[];
  footerText: string;
}): string {
  const detailRows = opts.details
    .map(
      (d) => `<tr><td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">${d.label}</span><span style="float:right;color:#0f172a;font-size:13px;font-weight:600;">${d.value}</span></td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">AlphaTek Nexus</h1>
<p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">${opts.subtitle}</p>
</td></tr>
<tr><td style="padding:32px 40px 0;text-align:center;">
<h2 style="margin:0 0 4px;color:#0f172a;font-size:20px;font-weight:700;">${opts.bodyTitle}</h2>
<p style="margin:0;color:#64748b;font-size:14px;">${opts.bodyText}</p>
</td></tr>
${detailRows ? `<tr><td style="padding:24px 40px;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">${detailRows}</table></td></tr>` : ""}
<tr><td style="padding:0 40px 32px;text-align:center;">
<p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">${opts.footerText}<br/>No reply is needed.</p>
<p style="margin:16px 0 0;color:#cbd5e1;font-size:11px;">&copy; AlphaTek Nexus. All rights reserved.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildEmailText(opts: {
  title: string;
  bodyTitle: string;
  bodyText: string;
  details: { label: string; value: string }[];
}): string {
  const detailLines = opts.details.map((d) => `${d.label}: ${d.value}`).join("\n");
  return `AlphaTek Nexus - ${opts.title}\n\n${opts.bodyTitle}\n${opts.bodyText}\n\n${detailLines}\n\nThis is an automated message. No reply is needed.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: EmailPayload = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let recipientEmail = payload.recipientEmail;
    let userName = "";

    if (!recipientEmail && payload.userId) {
      const { data: userData } = await supabase.auth.admin.getUserById(payload.userId);
      if (userData?.user?.email) {
        recipientEmail = userData.user.email;
        userName = (userData.user.user_metadata as any)?.full_name || recipientEmail.split("@")[0];
      }
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "No recipient email found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let subject = "";
    let html = "";
    let text = "";

    switch (payload.eventType) {
      case "booking_confirmation": {
        subject = `Booking Confirmed - ${payload.serviceName || "Service"} - AlphaTek Nexus`;
        const details = [
          { label: "Service", value: payload.serviceName || "N/A" },
          { label: "Date", value: payload.scheduledDate ? formatDate(payload.scheduledDate) : "TBD" },
          { label: "Time", value: payload.scheduledTime || "TBD" },
          { label: "Location", value: payload.location || "TBD" },
          { label: "Booking ID", value: payload.bookingId?.slice(0, 8) || "N/A" },
        ];
        html = buildEmailHtml({
          title: "Booking Confirmation",
          subtitle: "Booking Confirmation",
          bodyTitle: "Your booking is confirmed!",
          bodyText: `Hi ${userName}, we've received your booking request and our team is on it.`,
          details,
          footerText: "We'll send you updates as your booking progresses.",
        });
        text = buildEmailText({ title: "Booking Confirmation", bodyTitle: "Your booking is confirmed!", bodyText: `Hi ${userName}, we've received your booking request.`, details });
        break;
      }

      case "status_update": {
        const statusLabel = (payload.status || "updated").replace(/_/g, " ");
        subject = `Booking Update: ${statusLabel} - ${payload.serviceName || "Service"}`;
        const details = [
          { label: "Service", value: payload.serviceName || "N/A" },
          { label: "Status", value: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1) },
          { label: "Booking ID", value: payload.bookingId?.slice(0, 8) || "N/A" },
        ];
        html = buildEmailHtml({
          title: "Booking Status Update",
          subtitle: "Booking Update",
          bodyTitle: `Your booking is now: ${statusLabel}`,
          bodyText: `Hi ${userName}, the status of your booking has been updated.`,
          details,
          footerText: "Track your booking live in the AlphaTek Nexus portal.",
        });
        text = buildEmailText({ title: "Booking Status Update", bodyTitle: `Status: ${statusLabel}`, bodyText: `Hi ${userName}, your booking status has been updated.`, details });
        break;
      }

      case "review_prompt": {
        subject = "How was your service? - AlphaTek Nexus";
        const details = [
          { label: "Service", value: payload.serviceName || "N/A" },
          { label: "Booking ID", value: payload.bookingId?.slice(0, 8) || "N/A" },
        ];
        html = buildEmailHtml({
          title: "Rate Your Experience",
          subtitle: "Service Feedback",
          bodyTitle: "Your service is complete!",
          bodyText: `Hi ${userName}, please take a moment to rate your experience and help others choose the right service.`,
          details,
          footerText: "Log in to your portal to leave a review.",
        });
        text = buildEmailText({ title: "Rate Your Experience", bodyTitle: "Your service is complete!", bodyText: `Hi ${userName}, please rate your experience.`, details });
        break;
      }

      case "referral_invite": {
        subject = `${payload.referrerName || "Someone"} invited you to AlphaTek Nexus`;
        html = buildEmailHtml({
          title: "You're Invited!",
          subtitle: "Referral Invitation",
          bodyTitle: `${payload.referrerName || "Someone"} invited you to AlphaTek Nexus`,
          bodyText: "Join AlphaTek Nexus to access professional services across cleaning, security, logistics, procurement, and waste management. Use the referral code below when you sign up.",
          details: [
            { label: "Referral Code", value: payload.referralCode || "N/A" },
          ],
          footerText: "Use this code during signup to earn rewards.",
        });
        text = buildEmailText({
          title: "You're Invited!",
          bodyTitle: `${payload.referrerName || "Someone"} invited you to AlphaTek Nexus`,
          bodyText: "Use referral code to sign up and earn rewards.",
          details: [{ label: "Referral Code", value: payload.referralCode || "N/A" }],
        });
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown event type" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      await supabase.from("email_events").insert({
        user_id: payload.userId || null,
        event_type: payload.eventType,
        recipient_email: recipientEmail,
        subject,
        status: "failed",
        reference_id: payload.bookingId || null,
        error_message: "RESEND_API_KEY not configured",
      });
      return new Response(JSON.stringify({ error: "Resend API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
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

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      await supabase.from("email_events").insert({
        user_id: payload.userId || null,
        event_type: payload.eventType,
        recipient_email: recipientEmail,
        subject,
        status: "failed",
        reference_id: payload.bookingId || null,
        error_message: errText,
      });
      return new Response(JSON.stringify({ error: "Failed to send email", details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("email_events").insert({
      user_id: payload.userId || null,
      event_type: payload.eventType,
      recipient_email: recipientEmail,
      subject,
      status: "sent",
      reference_id: payload.bookingId || null,
    });

    return new Response(JSON.stringify({ success: true, recipientEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
