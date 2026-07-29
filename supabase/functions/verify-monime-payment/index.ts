import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const { reference } = await req.json();

    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Require authentication
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up the payment record — must belong to the calling user
    const { data: monimePayment, error: findErr } = await supabase
      .from("monime_payments")
      .select("*")
      .eq("reference", reference)
      .eq("user_id", user.id)
      .maybeSingle();

    if (findErr || !monimePayment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already completed — no need to poll Monime again
    if (monimePayment.status === "completed") {
      return new Response(JSON.stringify({ status: "completed", reference }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (monimePayment.status === "failed") {
      return new Response(JSON.stringify({ status: "failed", reference }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (monimePayment.status === "cancelled") {
      return new Response(JSON.stringify({ status: "cancelled", reference }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Poll Monime API for the checkout session status
    const monimeKey = Deno.env.get("MONIME_ACCESS_KEY");
    const spaceId = Deno.env.get("MONIME_SPACE_ID");

    if (!monimeKey || !spaceId) {
      return new Response(JSON.stringify({ error: "Monime not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionId = monimePayment.checkout_session_id;
    const monimeRes = await fetch(`https://api.monime.io/v1/checkout-sessions/${sessionId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${monimeKey}`,
        "Monime-Space-Id": spaceId,
        "Content-Type": "application/json",
      },
    });

    if (!monimeRes.ok) {
      const errText = await monimeRes.text();
      return new Response(JSON.stringify({ error: `Monime API error: ${monimeRes.status}`, details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await monimeRes.json();
    const result = session.result || session;
    const sessionStatus: string = (result.status || result.paymentStatus || "").toLowerCase();
    const paymentId: string = result.paymentId || result.payment_id || result.id || "";

    const isCompleted =
      sessionStatus === "paid" ||
      sessionStatus === "completed" ||
      sessionStatus === "succeeded";

    const isFailed = sessionStatus === "failed" || sessionStatus === "expired";
    const isCancelled = sessionStatus === "cancelled" || sessionStatus === "canceled";

    if (isCompleted) {
      // Update with WHERE status = 'pending' guard
      const { data: updated } = await supabase
        .from("monime_payments")
        .update({
          status: "completed",
          payment_id: paymentId,
          paid_at: new Date().toISOString(),
          raw_payload: session,
          updated_at: new Date().toISOString(),
        })
        .eq("id", monimePayment.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      // If another worker already processed it, return completed
      if (!updated) {
        return new Response(JSON.stringify({ status: "completed", reference }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Credit the wallet if this is a top-up and not already credited
      if (monimePayment.purpose === "wallet_topup") {
        const { data: existingTxn } = await supabase
          .from("wallet_transactions")
          .select("id")
          .eq("monime_payment_id", monimePayment.id)
          .maybeSingle();

        if (!existingTxn) {
          const { data: walletTx, error: walletErr } = await supabase
            .from("wallet_transactions")
            .insert({
              user_id: monimePayment.user_id,
              type: "topup",
              amount_sle: monimePayment.amount_sle,
              method: "monime",
              reference: reference,
              description: `Top-up via Monime (${paymentId})`,
              status: "completed",
              recorded_by: "monime_verify",
              monime_payment_id: monimePayment.id,
            })
            .select("id")
            .maybeSingle();

          if (walletErr) {
            console.error("Wallet credit insert FAILED:", walletErr.message, "for payment", monimePayment.id, "ref", reference);
          } else if (walletTx) {
            await supabase
              .from("monime_payments")
              .update({ related_id: walletTx.id })
              .eq("id", monimePayment.id);
          }
        }
      } else if (monimePayment.purpose === "invoice" && monimePayment.related_id) {
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

          // Atomic increment using RPC
          const { error: rpcErr } = await supabase.rpc("increment_invoice_paid", {
            p_invoice_id: monimePayment.related_id,
            p_amount: monimePayment.amount_sle,
          });

          if (rpcErr) {
            console.error("Failed to update invoice paid amount:", rpcErr.message);
          }
        }
      } else if (monimePayment.purpose === "booking" && monimePayment.related_id) {
        // Mark the booking as paid
        await supabase
          .from("bookings")
          .update({ payment_status: "paid" })
          .eq("id", monimePayment.related_id);

        // Insert a unified payment record
        const { data: existingPay } = await supabase
          .from("payments")
          .select("id")
          .eq("payable_type", "booking")
          .eq("payable_id", monimePayment.related_id)
          .maybeSingle();

        if (!existingPay) {
          await supabase
            .from("payments")
            .insert({
              user_id: monimePayment.user_id,
              payable_type: "booking",
              payable_id: monimePayment.related_id,
              amount_sle: monimePayment.amount_sle,
              method: "monime",
              status: "confirmed",
              reference: reference,
            });
        }
      } else if (monimePayment.purpose === "subscription" && monimePayment.related_id) {
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
              recorded_by: "monime_verify",
              monime_payment_id: monimePayment.id,
            });
        }
      }

      // Generate receipt (idempotent)
      const { data: existingReceipt } = await supabase
        .from("payment_receipts")
        .select("id")
        .eq("monime_payment_id", monimePayment.id)
        .maybeSingle();

      if (!existingReceipt) {
        const { data: receiptNum } = await supabase.rpc("generate_receipt_number");
        if (receiptNum) {
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

      return new Response(JSON.stringify({ status: "completed", reference }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (isFailed) {
      await supabase
        .from("monime_payments")
        .update({
          status: "failed",
          raw_payload: session,
          updated_at: new Date().toISOString(),
        })
        .eq("id", monimePayment.id)
        .eq("status", "pending");

      return new Response(JSON.stringify({ status: "failed", reference }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (isCancelled) {
      await supabase
        .from("monime_payments")
        .update({
          status: "cancelled",
          raw_payload: session,
          updated_at: new Date().toISOString(),
        })
        .eq("id", monimePayment.id)
        .eq("status", "pending");

      return new Response(JSON.stringify({ status: "cancelled", reference }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Still pending
    return new Response(JSON.stringify({ status: "pending", reference }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
