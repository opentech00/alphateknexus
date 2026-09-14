import { createClient } from "jsr:@supabase/supabase-js@2";
import { amountInWords, buildOfficialReceiptHtml, formatLe, purposeLabel } from "../_shared/companyDocs.ts";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let callerId: string | null = null;
    let callerIsPrivileged = token.length > 0 && serviceKey.length > 0 && token === serviceKey;

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

    const { receiptId } = await req.json();

    if (!receiptId) {
      return new Response(JSON.stringify({ error: "Missing receiptId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    if (!callerIsPrivileged && receipt.user_id !== callerId) {
      return new Response(JSON.stringify({ error: "Receipt not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (receipt.email_sent) {
      return new Response(JSON.stringify({ success: true, message: "Email already sent", alreadySent: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(receipt.user_id);

    if (userErr || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "User email not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone, address")
      .eq("id", receipt.user_id)
      .maybeSingle();

    const recipientEmail = userData.user.email;
    const userName = profile?.full_name ||
                     (userData.user.user_metadata as any)?.full_name ||
                     (userData.user.user_metadata as any)?.name ||
                     recipientEmail.split("@")[0];

    const emailHtml = buildOfficialReceiptHtml({
      receiptNumber: receipt.receipt_number,
      reference: receipt.reference,
      amountSle: receipt.amount_sle,
      currency: receipt.currency,
      purpose: receipt.purpose,
      description: receipt.description || "",
      paymentMethod: receipt.payment_method,
      paymentId: receipt.payment_id || "",
      paidAt: receipt.paid_at,
      clientName: userName,
      clientEmail: recipientEmail,
      clientPhone: profile?.phone,
      clientAddress: profile?.address,
    });

    const emailText = `Alphatek Global SL Limited — Payment Receipt

Receipt No.: ${receipt.receipt_number}
Reference: ${receipt.reference}
Client: ${userName}
Type: ${purposeLabel(receipt.purpose)}
Description: ${receipt.description || purposeLabel(receipt.purpose)}
Payment Method: ${receipt.payment_method}
Amount Paid: ${formatLe(Number(receipt.amount_sle))}
Amount in words: ${amountInWords(Number(receipt.amount_sle))}
Date: ${receipt.paid_at}

Please keep this receipt for your records.`;

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
        from: "Alphatek Global SL Limited <noreply@alphateknexus.com>",
        to: [recipientEmail],
        subject: `Payment Receipt ${receipt.receipt_number} — Alphatek Global SL Limited`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!resendRes.ok) {
      console.error("Resend API error:", await resendRes.text());
      return new Response(JSON.stringify({ error: "Failed to send receipt email" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("payment_receipts")
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        recipient_email: recipientEmail,
      })
      .eq("id", receipt.id);

    return new Response(JSON.stringify({ success: true, message: "Receipt email sent" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send receipt error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Receipt delivery failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
