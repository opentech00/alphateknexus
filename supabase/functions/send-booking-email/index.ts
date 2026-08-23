import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailPayload {
  eventType: "booking_confirmation" | "status_update" | "review_prompt" | "referral_invite" | "payment_verified" | "payment_rejected";
  bookingId?: string;
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
  const appUrl = (Deno.env.get("APP_URL") || "https://alphateknexus.com").replace(/\/$/, "");
  const detailRows = opts.details
    .map(
      (d) => `<tr><td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;"><span style="color:#64748b;font-size:13px;">${d.label}</span><span style="float:right;color:#0f172a;font-size:13px;font-weight:600;">${d.value}</span></td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f6;padding:32px 12px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #dbe3ea;border-radius:14px;overflow:hidden;">
<tr><td style="height:5px;background:#10b981;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 36px 22px;border-bottom:1px solid #edf1f5;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
<td><img src="${appUrl}/alphateknexus_logo.png" width="42" height="42" alt="AlphaTek Nexus" style="display:block;border-radius:10px;"></td>
<td style="padding-left:12px;"><strong style="display:block;color:#0f172a;font-size:17px;">AlphaTek Nexus</strong><span style="display:block;margin-top:3px;color:#64748b;font-size:12px;">${opts.subtitle}</span></td>
</tr></table></td></tr>
<tr><td style="padding:34px 36px 12px;text-align:left;">
<h1 style="margin:0 0 8px;color:#0f172a;font-size:24px;font-weight:700;line-height:1.25;">${opts.bodyTitle}</h1>
<p style="margin:0;color:#475569;font-size:15px;line-height:1.65;">${opts.bodyText}</p>
</td></tr>
${detailRows ? `<tr><td style="padding:22px 36px 28px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">${detailRows}</table></td></tr>` : ""}
<tr><td style="padding:20px 36px;background:#f8fafc;border-top:1px solid #edf1f5;">
<p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">${opts.footerText}<br>No reply is needed.</p>
<p style="margin:12px 0 0;color:#94a3b8;font-size:11px;">&copy; AlphaTek Nexus. All rights reserved.</p>
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let callerId: string | null = null;
    let callerIsPrivileged = token.length > 0 && token === serviceKey;

    if (!callerIsPrivileged) {
      if (token.length === 0) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: authData } = await supabase.auth.getUser(token);
      if (!authData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerId = authData.user.id;
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", callerId)
        .maybeSingle();
      callerIsPrivileged = callerProfile?.role === "admin";
    }

    const payload: EmailPayload = await req.json();

    // The recipient is never taken from the request body: only a privileged
    // caller may target another account, everyone else emails themselves.
    const targetUserId = callerIsPrivileged ? payload.userId : callerId;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "No recipient specified" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let recipientEmail = "";
    let userName = "";

    const { data: userData } = await supabase.auth.admin.getUserById(targetUserId);
    if (userData?.user?.email) {
      recipientEmail = userData.user.email;
      userName = (userData.user.user_metadata as any)?.full_name || recipientEmail.split("@")[0];
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "No recipient email found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A non-privileged caller may only reference their own booking.
    if (!callerIsPrivileged && payload.bookingId) {
      const { data: booking } = await supabase
        .from("bookings")
        .select("user_id")
        .eq("id", payload.bookingId)
        .maybeSingle();
      if (!booking || booking.user_id !== callerId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

      case "payment_verified": {
        subject = `Payment Verified - ${payload.serviceName || "Service"} - AlphaTek Nexus`;
        const details = [
          { label: "Service", value: payload.serviceName || "N/A" },
          { label: "Booking ID", value: payload.bookingId?.slice(0, 8) || "N/A" },
          { label: "Payment Method", value: "Bank Transfer" },
        ];
        html = buildEmailHtml({
          title: "Payment Verified",
          subtitle: "Payment Confirmation",
          bodyTitle: "Your bank payment has been verified!",
          bodyText: `Hi ${userName}, your bank payment proof has been reviewed and confirmed by our team. Your booking is now active.`,
          details,
          footerText: "You can track your booking progress in the AlphaTek Nexus portal.",
        });
        text = buildEmailText({ title: "Payment Verified", bodyTitle: "Your bank payment has been verified!", bodyText: `Hi ${userName}, your bank payment has been confirmed.`, details });
        break;
      }

      case "payment_rejected": {
        subject = `Payment Needs Attention - ${payload.serviceName || "Service"} - AlphaTek Nexus`;
        const details = [
          { label: "Service", value: payload.serviceName || "N/A" },
          { label: "Booking ID", value: payload.bookingId?.slice(0, 8) || "N/A" },
          { label: "Payment Method", value: "Bank Transfer" },
        ];
        html = buildEmailHtml({
          title: "Payment Rejected",
          subtitle: "Payment Needs Attention",
          bodyTitle: "Your bank payment could not be verified",
          bodyText: `Hi ${userName}, we were unable to verify your bank payment proof. Please check the reason below and re-upload a valid document.`,
          details,
          footerText: "Log in to your portal to re-upload your payment proof.",
        });
        text = buildEmailText({ title: "Payment Rejected", bodyTitle: "Your bank payment could not be verified", bodyText: `Hi ${userName}, please re-upload a valid payment proof.`, details });
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
        user_id: targetUserId,
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
        user_id: targetUserId,
        event_type: payload.eventType,
        recipient_email: recipientEmail,
        subject,
        status: "failed",
        reference_id: payload.bookingId || null,
        error_message: errText,
      });
      console.error("send-booking-email delivery failure:", errText);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("email_events").insert({
      user_id: targetUserId,
      event_type: payload.eventType,
      recipient_email: recipientEmail,
      subject,
      status: "sent",
      reference_id: payload.bookingId || null,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-booking-email error:", err);
    return new Response(JSON.stringify({ error: "Could not send email" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
