import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    // Constant-time comparison
    if (hex.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = await req.text();
    const signature = req.headers.get("X-Monime-Signature") || req.headers.get("Monime-Signature") || "";
    const webhookSecret = Deno.env.get("MONIME_WEBHOOK_SECRET");

    // Signature verification is MANDATORY — fail-closed if secret is missing
    if (!webhookSecret) {
      console.error("MONIME_WEBHOOK_SECRET is not configured — rejecting webhook");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const valid = await verifySignature(payload, signature, webhookSecret);
    if (!valid) {
      console.error("Webhook signature verification failed");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(payload);
    const eventType: string = event.type || event.eventType || "";
    const data = event.data || event.object || event;

    const reference: string = data.reference || data.metadata?.reference || "";
    const paymentId: string = data.id || data.paymentId || "";
    const sessionId: string = data.checkoutSessionId || data.sessionId || data.id || "";
    const status: string = data.status || "";

    if (!reference) {
      console.error("No reference found in webhook payload");
      return new Response(JSON.stringify({ received: true, error: "No reference" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find the monime_payment record by reference
    const { data: monimePayment, error: findErr } = await supabase
      .from("monime_payments")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    if (findErr || !monimePayment) {
      console.error("Payment not found for reference:", reference);
      return new Response(JSON.stringify({ received: true, error: "Payment not found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine if payment is successful
    const isCompleted =
      eventType === "payment.completed" ||
      eventType === "checkout.session.completed" ||
      eventType === "payment.succeeded" ||
      status === "completed" ||
      status === "succeeded";

    const isFailed =
      eventType === "payment.failed" ||
      eventType === "checkout.session.expired" ||
      status === "failed";

    const isCancelled =
      eventType === "payment.cancelled" ||
      eventType === "checkout.session.canceled" ||
      status === "cancelled" ||
      status === "canceled";

    if (isCompleted) {
      // Idempotency guard: only process if currently pending
      if (monimePayment.status === "completed") {
        return new Response(JSON.stringify({ received: true, already: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update with WHERE status = 'pending' guard to prevent double-processing
      const { data: updated, error: updErr } = await supabase
        .from("monime_payments")
        .update({
          status: "completed",
          payment_id: paymentId,
          paid_at: new Date().toISOString(),
          raw_payload: event,
          updated_at: new Date().toISOString(),
        })
        .eq("id", monimePayment.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      // If no row was updated, another worker already processed it
      if (updErr || !updated) {
        return new Response(JSON.stringify({ received: true, already: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Process based on purpose — each with idempotency checks
      if (monimePayment.purpose === "wallet_topup") {
        // Check for existing wallet transaction (idempotency)
        const { data: existingTxn } = await supabase
          .from("wallet_transactions")
          .select("id")
          .eq("monime_payment_id", monimePayment.id)
          .maybeSingle();

        if (!existingTxn) {
          const { data: walletTx } = await supabase
            .from("wallet_transactions")
            .insert({
              user_id: monimePayment.user_id,
              type: "topup",
              amount_sle: monimePayment.amount_sle,
              method: "monime",
              reference: reference,
              description: `Top-up via Monime (${paymentId})`,
              status: "completed",
              recorded_by: "monime_webhook",
              monime_payment_id: monimePayment.id,
            })
            .select("id")
            .maybeSingle();

          if (walletTx) {
            await supabase
              .from("monime_payments")
              .update({ related_id: walletTx.id })
              .eq("id", monimePayment.id);
          }
        }
      } else if (monimePayment.purpose === "invoice" && monimePayment.related_id) {
        // Check for existing payment record (idempotency)
        const { data: existingPay } = await supabase
          .from("smart_sort_payments")
          .select("id")
          .eq("monime_payment_id", monimePayment.id)
          .maybeSingle();

        if (!existingPay) {
          await supabase
            .from("smart_sort_payments")
            .insert({
              invoice_id: monimePayment.related_id,
              user_id: monimePayment.user_id,
              amount_sle: monimePayment.amount_sle,
              method: "monime",
              reference: reference,
              status: "confirmed",
              monime_payment_id: monimePayment.id,
            });

          // Atomic increment of amount_paid_sle using RPC to avoid lost updates
          const { error: rpcErr } = await supabase.rpc("increment_invoice_paid", {
            p_invoice_id: monimePayment.related_id,
            p_amount: monimePayment.amount_sle,
          });

          if (rpcErr) {
            console.error("Failed to update invoice paid amount:", rpcErr.message);
          }
        }
      } else if (monimePayment.purpose === "subscription" && monimePayment.related_id) {
        // Check for existing transaction (idempotency)
        const { data: existingTxn } = await supabase
          .from("wallet_transactions")
          .select("id")
          .eq("monime_payment_id", monimePayment.id)
          .maybeSingle();

        if (!existingTxn) {
          await supabase
            .from("wallet_transactions")
            .insert({
              user_id: monimePayment.user_id,
              type: "payment",
              amount_sle: -monimePayment.amount_sle,
              method: "monime",
              reference: reference,
              description: `Subscription payment via Monime (${paymentId})`,
              status: "completed",
              recorded_by: "monime_webhook",
              monime_payment_id: monimePayment.id,
            });
        }
      }

      // Generate a payment receipt (idempotent — checks for existing receipt first)
      const { data: existingReceipt } = await supabase
        .from("payment_receipts")
        .select("id")
        .eq("monime_payment_id", monimePayment.id)
        .maybeSingle();

      if (!existingReceipt) {
        const { data: receiptNum } = await supabase.rpc("generate_receipt_number");
        if (!receiptNum) {
          console.error("Failed to generate receipt number");
        } else {
          const { data: receipt } = await supabase
            .from("payment_receipts")
            .insert({
              user_id: monimePayment.user_id,
              monime_payment_id: monimePayment.id,
              receipt_number: receiptNum,
              reference: reference,
              amount_sle: monimePayment.amount_sle,
              currency: monimePayment.currency || "SLE",
              purpose: monimePayment.purpose,
              description: monimePayment.purpose === "wallet_topup"
                ? "Wallet top-up via Monime"
                : monimePayment.purpose === "invoice"
                ? "Smart Sort invoice payment"
                : "Subscription payment via Monime",
              payment_method: "monime",
              payment_id: paymentId,
              paid_at: new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();

          // Send receipt email via edge function (fire-and-forget)
          if (receipt) {
            try {
              const resendKey = Deno.env.get("RESEND_API_KEY");
              if (resendKey) {
                await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-receipt`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({ receiptId: receipt.id }),
                });
              }
            } catch (e) {
              console.error("Receipt email send failed:", e.message);
            }
          }
        }
      }
    } else if (isFailed) {
      await supabase
        .from("monime_payments")
        .update({
          status: "failed",
          raw_payload: event,
          updated_at: new Date().toISOString(),
        })
        .eq("id", monimePayment.id)
        .eq("status", "pending");
    } else if (isCancelled) {
      await supabase
        .from("monime_payments")
        .update({
          status: "cancelled",
          raw_payload: event,
          updated_at: new Date().toISOString(),
        })
        .eq("id", monimePayment.id)
        .eq("status", "pending");
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
