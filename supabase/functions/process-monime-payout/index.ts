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
    const { withdrawal_id } = await req.json();

    if (!withdrawal_id) {
      return new Response(JSON.stringify({ error: "Missing withdrawal_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: withdrawal, error: wErr } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("id", withdrawal_id)
      .maybeSingle();

    if (wErr || !withdrawal) {
      return new Response(JSON.stringify({ error: "Withdrawal not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only admin can process payouts — no owner self-payout
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!adminProfile || adminProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only an admin can process payouts" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: if already has a payout id, don't send again
    if (withdrawal.monime_payout_id) {
      return new Response(JSON.stringify({
        success: true,
        message: "Payout already processed",
        payout_id: withdrawal.monime_payout_id,
        payout_status: withdrawal.payout_status || "completed",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Must be approved before payout
    if (withdrawal.status !== "approved") {
      return new Response(JSON.stringify({ error: "Withdrawal must be approved before processing payout" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (withdrawal.payout_method !== "mobile_money") {
      return new Response(JSON.stringify({ error: "This function only handles mobile money payouts" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = withdrawal.payout_details?.phone;
    const providerId = withdrawal.payout_details?.provider_id;

    if (!phone) {
      return new Response(JSON.stringify({ error: "No phone number on withdrawal request" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!providerId) {
      return new Response(JSON.stringify({ error: "No mobile money provider selected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-flight balance check — compute from completed wallet_transactions
    const { data: txData } = await supabase
      .from("wallet_transactions")
      .select("amount_sle")
      .eq("user_id", withdrawal.user_id)
      .eq("status", "completed");

    const walletBalance = (txData || []).reduce((sum: number, r: any) => sum + Number(r.amount_sle), 0);
    if (walletBalance < Number(withdrawal.amount_sle)) {
      return new Response(JSON.stringify({ error: "User has insufficient wallet balance for this payout" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const monimeKey = Deno.env.get("MONIME_ACCESS_KEY");
    const spaceId = Deno.env.get("MONIME_SPACE_ID");

    if (!monimeKey || !spaceId) {
      return new Response(JSON.stringify({ error: "Monime not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idempotencyKey = `payout-${withdrawal_id}`;

    // Mark payout as sent BEFORE calling Monime (so a timeout doesn't cause a retry)
    await supabase.from("withdrawal_requests").update({
      payout_status: "sent",
    }).eq("id", withdrawal_id);

    const monimeRes = await fetch("https://api.monime.io/v1/payouts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${monimeKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "Monime-Space-Id": spaceId,
        "Monime-Version": "caph.2025-08-23",
      },
      body: JSON.stringify({
        amount: {
          currency: "SLE",
          value: Math.round(Number(withdrawal.amount_sle) * 100),
        },
        destination: {
          type: "momo",
          providerId: providerId,
          phoneNumber: phone,
        },
        metadata: {
          withdrawal_id: withdrawal_id,
          user_id: withdrawal.user_id,
        },
      }),
    });

    const monimeData = await monimeRes.json();

    if (!monimeRes.ok) {
      // Rollback payout_status to allow retry
      await supabase.from("withdrawal_requests").update({
        payout_status: "failed",
        admin_note: `Monime payout failed: ${monimeData?.error?.message || monimeRes.status}`,
      }).eq("id", withdrawal_id);

      const errMsg = monimeData?.error?.message || monimeData?.message || `Monime API error: ${monimeRes.status}`;
      return new Response(JSON.stringify({ error: "Monime payout failed", details: errMsg }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payout = monimeData.result || monimeData;
    const payoutId = payout?.id;
    const payoutStatus = payout?.status || "pending";

    // Debit the wallet FIRST, then record the payout id
    const { error: rpcErr } = await supabase.rpc("process_withdrawal_completion", {
      p_withdrawal_id: withdrawal_id,
      p_monime_payout_id: payoutId || null,
    });

    if (rpcErr) {
      // Payout was sent but wallet debit failed — flag for manual reconciliation
      await supabase.from("withdrawal_requests").update({
        payout_status: "sent",
        admin_note: `URGENT: Payout ${payoutId} sent but wallet debit failed: ${rpcErr.message}. Manual reconciliation needed.`,
      }).eq("id", withdrawal_id);

      return new Response(JSON.stringify({
        error: "Payout sent but failed to update wallet: " + rpcErr.message,
        payout_id: payoutId,
        needs_reconciliation: true,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("withdrawal_requests").update({
      reference: payoutId || null,
      admin_note: `Monime payout ${payoutId || ""} - status: ${payoutStatus}`,
    }).eq("id", withdrawal_id);

    return new Response(JSON.stringify({
      success: true,
      payout_id: payoutId,
      payout_status: payoutStatus,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
