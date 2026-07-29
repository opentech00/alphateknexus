import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ReceiptData {
  receiptNumber: string;
  reference: string;
  amountSle: number;
  currency: string;
  purpose: string;
  description: string;
  paymentMethod: string;
  paymentId: string;
  paidAt: string;
  recipientEmail: string;
  userName: string;
}

function formatPurpose(purpose: string): string {
  switch (purpose) {
    case "wallet_topup": return "Wallet Top-Up";
    case "invoice": return "Invoice Payment";
    case "subscription": return "Subscription Payment";
    default: return "Payment";
  }
}

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildEmailHtml(data: ReceiptData): string {
  const purposeLabel = formatPurpose(data.purpose);
  const amountFormatted = formatMoney(data.amountSle, data.currency);
  const paidDate = formatDate(data.paidAt);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">AlphaTek Nexus</h1>
              <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">Payment Receipt</p>
            </td>
          </tr>
          <!-- Success badge -->
          <tr>
            <td style="padding:32px 40px 0;text-align:center;">
              <div style="display:inline-block;width:56px;height:56px;background-color:#dcfce7;border-radius:50%;text-align:center;line-height:56px;font-size:28px;">✓</div>
              <h2 style="margin:16px 0 4px;color:#0f172a;font-size:20px;font-weight:700;">Payment Successful</h2>
              <p style="margin:0;color:#64748b;font-size:14px;">Your payment has been confirmed and processed.</p>
            </td>
          </tr>
          <!-- Amount -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Amount Paid</p>
              <p style="margin:8px 0 0;color:#059669;font-size:32px;font-weight:800;letter-spacing:-1px;">${amountFormatted}</p>
            </td>
          </tr>
          <!-- Details -->
          <tr>
            <td style="padding:0 40px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="color:#64748b;font-size:13px;">Receipt No.</span>
                    <span style="float:right;color:#0f172a;font-size:13px;font-weight:600;font-family:monospace;">${data.receiptNumber}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="color:#64748b;font-size:13px;">Reference</span>
                    <span style="float:right;color:#0f172a;font-size:13px;font-weight:600;font-family:monospace;">${data.reference}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="color:#64748b;font-size:13px;">Type</span>
                    <span style="float:right;color:#0f172a;font-size:13px;font-weight:600;">${purposeLabel}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="color:#64748b;font-size:13px;">Description</span>
                    <span style="float:right;color:#0f172a;font-size:13px;font-weight:600;text-align:right;max-width:240px;">${data.description || purposeLabel}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="color:#64748b;font-size:13px;">Payment Method</span>
                    <span style="float:right;color:#0f172a;font-size:13px;font-weight:600;text-transform:capitalize;">${data.paymentMethod}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="color:#64748b;font-size:13px;">Transaction ID</span>
                    <span style="float:right;color:#0f172a;font-size:13px;font-weight:600;font-family:monospace;">${data.paymentId || "N/A"}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;">
                    <span style="color:#64748b;font-size:13px;">Date & Time</span>
                    <span style="float:right;color:#0f172a;font-size:13px;font-weight:600;">${paidDate}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0 40px 32px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
                This is an automated receipt for your payment on AlphaTek Nexus.<br/>
                Please keep this for your records. No reply is needed.
              </p>
              <p style="margin:16px 0 0;color:#cbd5e1;font-size:11px;">© AlphaTek Nexus. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildEmailText(data: ReceiptData): string {
  const purposeLabel = formatPurpose(data.purpose);
  return `AlphaTek Nexus - Payment Receipt

Payment Successful!

Amount Paid: ${formatMoney(data.amountSle, data.currency)}

Receipt No.: ${data.receiptNumber}
Reference: ${data.reference}
Type: ${purposeLabel}
Description: ${data.description || purposeLabel}
Payment Method: ${data.paymentMethod}
Transaction ID: ${data.paymentId || "N/A"}
Date & Time: ${formatDate(data.paidAt)}

This is an automated receipt for your payment on AlphaTek Nexus.
Please keep this for your records.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { receiptId } = await req.json();

    if (!receiptId) {
      return new Response(JSON.stringify({ error: "Missing receiptId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the receipt
    const { data: receipt, error: receiptErr } = await supabase
      .from("payment_receipts")
      .select("*")
      .eq("id", receiptId)
      .maybeSingle();

    if (receiptErr || !receipt) {
      return new Response(JSON.stringify({ error: "Receipt not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already sent
    if (receipt.email_sent) {
      return new Response(JSON.stringify({ success: true, message: "Email already sent", alreadySent: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user email from auth.users
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(receipt.user_id);

    if (userErr || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "User email not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipientEmail = userData.user.email;
    const userName = (userData.user.user_metadata as any)?.full_name ||
                     (userData.user.user_metadata as any)?.name ||
                     recipientEmail.split("@")[0];

    const emailHtml = buildEmailHtml({
      receiptNumber: receipt.receipt_number,
      reference: receipt.reference,
      amountSle: receipt.amount_sle,
      currency: receipt.currency,
      purpose: receipt.purpose,
      description: receipt.description || "",
      paymentMethod: receipt.payment_method,
      paymentId: receipt.payment_id || "",
      paidAt: receipt.paid_at,
      recipientEmail,
      userName,
    });

    const emailText = buildEmailText({
      receiptNumber: receipt.receipt_number,
      reference: receipt.reference,
      amountSle: receipt.amount_sle,
      currency: receipt.currency,
      purpose: receipt.purpose,
      description: receipt.description || "",
      paymentMethod: receipt.payment_method,
      paymentId: receipt.payment_id || "",
      paidAt: receipt.paid_at,
      recipientEmail,
      userName,
    });

    // Send via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "Resend API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AlphaTek Nexus <noreply@alphateknexus.com>",
        to: [recipientEmail],
        subject: `Payment Receipt ${receipt.receipt_number} - AlphaTek Nexus`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend API error:", errText);
      return new Response(JSON.stringify({ error: "Failed to send email", details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark receipt as email sent
    await supabase
      .from("payment_receipts")
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        recipient_email: recipientEmail,
      })
      .eq("id", receipt.id);

    return new Response(JSON.stringify({ success: true, message: "Receipt email sent", recipientEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send receipt error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
